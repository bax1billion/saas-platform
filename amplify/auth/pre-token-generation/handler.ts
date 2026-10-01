import type { PreTokenGenerationTriggerEvent, PreTokenGenerationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  MFA_SETUP_CLAIM,
  configuredMethodsFromEnv,
  decideTokenIssue,
  normalizeAuthPolicy,
  signInMethodFor,
  type StoredAuthPolicy,
} from '../../shared/auth-policy';

/** What the trigger needs from the outside world; injected in tests. */
export type PolicyLookups = {
  /** The user's organization policy, or null when they have no org yet. */
  orgPolicyForSub(sub: string): Promise<StoredAuthPolicy | null>;
  /** True when the user has an authenticator app (TOTP) turned on. */
  totpEnrolled(userPoolId: string, username: string): Promise<boolean>;
};

/**
 * The decision, separated from AWS so it is unit-tested. Throwing makes
 * Cognito refuse the sign-in and show the message; an "enroll" decision
 * issues tokens without groups, so AppSync's group rules deny every read
 * and write until the user sets up two-step sign-in and refreshes.
 *
 * If a lookup itself fails (a table or Cognito call errors), the tokens are
 * issued unchanged and the error is logged: an outage in this trigger must
 * not lock every organization out of the app.
 */
export async function applySignInPolicy(
  event: PreTokenGenerationTriggerEvent,
  configuredValue: string | undefined,
  lookups: PolicyLookups
): Promise<PreTokenGenerationTriggerEvent> {
  const attrs = event.request.userAttributes ?? {};
  const sub = attrs.sub;
  if (!sub) return event;

  const configured = configuredMethodsFromEnv(configuredValue);
  const method = signInMethodFor(
    event.userName,
    attrs.identities,
    configured.filter((m) => m !== 'password')
  );

  let stored: StoredAuthPolicy | null;
  try {
    stored = await lookups.orgPolicyForSub(sub);
  } catch (err) {
    console.error('Sign-in policy lookup failed; issuing tokens unchanged', err);
    return event;
  }
  if (!stored) return event; // no organization yet: onboarding, any method

  const policy = normalizeAuthPolicy(stored, configured);
  const needsTotpCheck =
    policy.mfaPolicy === 'REQUIRED' && method === 'password';
  let totpEnrolled = false;
  if (needsTotpCheck) {
    try {
      totpEnrolled = await lookups.totpEnrolled(event.userPoolId, event.userName);
    } catch (err) {
      console.error('Two-step status lookup failed; issuing tokens unchanged', err);
      return event;
    }
  }

  const decision = decideTokenIssue({ method, policy, totpEnrolled });
  if (decision.kind === 'deny') {
    throw new Error(decision.message);
  }
  if (decision.kind === 'enroll') {
    event.response = {
      claimsOverrideDetails: {
        claimsToAddOrOverride: { [MFA_SETUP_CLAIM]: 'true' },
        groupOverrideDetails: { groupsToOverride: [] },
      },
    };
  }
  return event;
}

// ── AWS lookups ────────────────────────────────────────────────────────
// Table names are discovered with ListTables, the same way (and with the
// same multi-sandbox caveat) as ../post-confirmation/handler.ts: the auth
// stack cannot reference data-stack resources without a deploy cycle.

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const cognito = new CognitoIdentityProviderClient({});

let tables: { user: string; org: string } | undefined;

async function tableNames(): Promise<{ user: string; org: string }> {
  if (tables) return tables;
  const names: string[] = [];
  let start: string | undefined;
  do {
    const res = await ddbClient.send(new ListTablesCommand({ ExclusiveStartTableName: start }));
    names.push(...(res.TableNames ?? []));
    start = res.LastEvaluatedTableName;
  } while (start);
  const user = names.find((t) => t.startsWith('User-'));
  const org = names.find((t) => t.startsWith('Organization-'));
  if (!user || !org) {
    throw new Error('User or Organization table not found.');
  }
  tables = { user, org };
  return tables;
}

const awsLookups: PolicyLookups = {
  async orgPolicyForSub(sub) {
    const { user, org } = await tableNames();
    const users = await ddb.send(
      new QueryCommand({
        TableName: user,
        IndexName: 'usersByCognitoSub',
        KeyConditionExpression: '#s = :s',
        ExpressionAttributeNames: { '#s': 'cognitoSub' },
        ExpressionAttributeValues: { ':s': sub },
        Limit: 1,
      })
    );
    const orgId = users.Items?.[0]?.orgId as string | undefined;
    if (!orgId) return null;
    const res = await ddb.send(
      new GetCommand({
        TableName: org,
        Key: { id: orgId },
        ProjectionExpression: 'signInMethods, mfaPolicy',
      })
    );
    if (!res.Item) return null;
    return {
      signInMethods: (res.Item.signInMethods as string[] | undefined) ?? null,
      mfaPolicy: (res.Item.mfaPolicy as string | undefined) ?? null,
    };
  },
  async totpEnrolled(userPoolId, username) {
    const res = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: username })
    );
    return (res.UserMFASettingList ?? []).includes('SOFTWARE_TOKEN_MFA');
  },
};

export const handler: PreTokenGenerationTriggerHandler = async (event) =>
  applySignInPolicy(event, process.env.AUTH_FEDERATED_PROVIDERS, awsLookups);
