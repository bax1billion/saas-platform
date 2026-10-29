#!/usr/bin/env bash
# Install the Amplify deploy-status hook in one hosting account
# (docs/pull-request-gates.md § 6). Idempotent: run it again to update the
# code, the token or the branches.
#
#   scripts/deploy-status/deploy.sh --profile <aws profile> --token-file <path> [--region us-east-2] \
#       [--branches staging] [--app-id <amplify app id>] --repo <owner/repo>
#
# What it makes, all named amplify-deploy-status:
#   - a Secrets Manager secret github/deploy-status-token holding a GitHub
#     fine-grained token for the one repository with Contents: read and write
#     (repository_dispatch needs it);
#   - an IAM role for the function: logs, amplify:GetJob, read that secret;
#   - the Lambda (Node 22, handler.mjs + payload.mjs from this folder);
#   - an EventBridge rule on "Amplify Deployment Status Change", scoped to
#     one app when --app-id is given, and the permission for it to invoke.
#
# The token file is read once and never printed. Run it once per hosting account, with --branches naming the
# branches that account builds. Needs the AWS CLI v2 and zip.
set -euo pipefail

PROFILE=""; REGION="us-east-2"; REPO=""; BRANCHES="main"; APP_ID=""; TOKEN_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --branches) BRANCHES="$2"; shift 2 ;;
    --app-id) APP_ID="$2"; shift 2 ;;
    --token-file) TOKEN_FILE="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$PROFILE" ] || { echo "--profile is required" >&2; exit 2; }
[ -n "$REPO" ] || { echo "--repo <owner/repo> is required" >&2; exit 2; }

NAME="amplify-deploy-status"
SECRET_NAME="github/deploy-status-token"
HERE="$(cd "$(dirname "$0")" && pwd)"
AWS=(aws --profile "$PROFILE" --region "$REGION" --output text --no-cli-pager)

ACCOUNT=$("${AWS[@]}" sts get-caller-identity --query Account)
echo "account $ACCOUNT, region $REGION, repo $REPO, branches $BRANCHES"

# 1. The token, in Secrets Manager.
if [ -n "$TOKEN_FILE" ]; then
  [ -s "$TOKEN_FILE" ] || { echo "token file is empty: $TOKEN_FILE" >&2; exit 2; }
  if "${AWS[@]}" secretsmanager describe-secret --secret-id "$SECRET_NAME" >/dev/null 2>&1; then
    "${AWS[@]}" secretsmanager put-secret-value --secret-id "$SECRET_NAME" --secret-string "file://$TOKEN_FILE" --query VersionId
  else
    "${AWS[@]}" secretsmanager create-secret --name "$SECRET_NAME" --description "GitHub token for the Amplify deploy-status hook" --secret-string "file://$TOKEN_FILE" --query ARN
  fi
fi
SECRET_ARN=$("${AWS[@]}" secretsmanager describe-secret --secret-id "$SECRET_NAME" --query ARN) || { echo "no secret $SECRET_NAME; pass --token-file on the first run" >&2; exit 2; }

# 2. The role.
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
if ! ROLE_ARN=$("${AWS[@]}" iam get-role --role-name "$NAME" --query Role.Arn 2>/dev/null); then
  ROLE_ARN=$("${AWS[@]}" iam create-role --role-name "$NAME" --assume-role-policy-document "$TRUST" --description "Amplify deploy status into GitHub" --query Role.Arn)
  echo "created role; waiting for IAM to propagate"; sleep 12
fi
POLICY=$(cat <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],"Resource":"arn:aws:logs:$REGION:$ACCOUNT:log-group:/aws/lambda/$NAME:*"},
 {"Effect":"Allow","Action":"amplify:GetJob","Resource":"arn:aws:amplify:$REGION:$ACCOUNT:apps/*/branches/*/jobs/*"},
 {"Effect":"Allow","Action":"secretsmanager:GetSecretValue","Resource":"$SECRET_ARN"}
]}
EOF
)
"${AWS[@]}" iam put-role-policy --role-name "$NAME" --policy-name "$NAME" --policy-document "$POLICY"

# 3. The code.
ZIP="$(mktemp -d)/deploy-status.zip"
(cd "$HERE" && zip -q -j "$ZIP" handler.mjs payload.mjs)
ENV="Variables={GITHUB_REPOSITORY=$REPO,GITHUB_TOKEN_SECRET_ARN=$SECRET_ARN,TRACKED_BRANCHES=$BRANCHES}"
if FN_ARN=$("${AWS[@]}" lambda get-function --function-name "$NAME" --query Configuration.FunctionArn 2>/dev/null); then
  "${AWS[@]}" lambda update-function-code --function-name "$NAME" --zip-file "fileb://$ZIP" --query LastUpdateStatus
  "${AWS[@]}" lambda wait function-updated --function-name "$NAME"
  "${AWS[@]}" lambda update-function-configuration --function-name "$NAME" --runtime nodejs22.x --handler handler.handler --timeout 30 --environment "$ENV" --query LastUpdateStatus
  "${AWS[@]}" lambda wait function-updated --function-name "$NAME"
else
  FN_ARN=$("${AWS[@]}" lambda create-function --function-name "$NAME" --runtime nodejs22.x --handler handler.handler --role "$ROLE_ARN" \
    --zip-file "fileb://$ZIP" --timeout 30 --memory-size 256 --environment "$ENV" --description "Amplify deploy status into GitHub" --query FunctionArn)
  "${AWS[@]}" lambda wait function-active --function-name "$NAME"
fi
rm -f "$ZIP"

# 4. The rule.
if [ -n "$APP_ID" ]; then
  PATTERN="{\"source\":[\"aws.amplify\"],\"detail-type\":[\"Amplify Deployment Status Change\"],\"detail\":{\"appId\":[\"$APP_ID\"]}}"
else
  PATTERN='{"source":["aws.amplify"],"detail-type":["Amplify Deployment Status Change"]}'
fi
RULE_ARN=$("${AWS[@]}" events put-rule --name "$NAME" --event-pattern "$PATTERN" --state ENABLED --description "Amplify deploy status into GitHub" --query RuleArn)
"${AWS[@]}" events put-targets --rule "$NAME" --targets "Id=lambda,Arn=$FN_ARN" --query FailedEntryCount
"${AWS[@]}" lambda add-permission --function-name "$NAME" --statement-id events-invoke --action lambda:InvokeFunction \
  --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 || true

echo "done: $FN_ARN"
echo "next deploy of $BRANCHES posts to GitHub; watch: aws --profile $PROFILE --region $REGION logs tail /aws/lambda/$NAME --follow"
