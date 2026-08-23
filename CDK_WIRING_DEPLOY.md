# CDK Wiring Notes — Amplify Gen 2 Circular-Dependency Patterns

`amplify/backend.ts` contains custom CDK wiring (DynamoDB streams, S3
notifications, SNS, function URLs). Its structure is dictated by one
CloudFormation constraint, learned the hard way during the original
product's deploys:

> **`Nested stack 'function' cannot depend on a parent stack.`**
> `allow.resource(fn)` in the data schema creates a **data→function**
> dependency. Any escape-hatch wiring that passes CloudFormation tokens from
> the data/storage/parent stacks into function-stack resources creates
> **function→parent**, completing a cycle CloudFormation rejects.

Every pattern below exists to keep dependencies one-way. When adding new
wiring (vertical triggers, scheduled jobs, new event sources), follow the
same rules or the deploy will fail with the error above.

## Rules

1. **Scope custom resources into the data stack** (`Stack.of(backend.data.resources.graphqlApi)`),
   not `backend.stack`. Parent-stack constructs that auto-create Lambda
   Permissions (SNS subscriptions, EventBridge targets) put those permissions
   in the function stack referencing parent tokens → cycle. Data-stack
   scoping keeps the references legal.
2. **IAM policies use wildcard ARN strings, never cross-stack tokens.**
   `fn.addToRolePolicy` with `arn:aws:dynamodb:{region}:{account}:table/*/stream/*`
   style wildcards deploys fine; interpolating a table/bucket token does not.
3. **Stream ARNs are looked up at deploy time.** Amplify's
   `Custom::AmplifyDynamoDBTable` doesn't expose `StreamArn`, so
   `getAtt('StreamArn')` fails. `backend.ts` uses an `AwsCustomResource`
   calling `DynamoDB.describeTable` per table and reads
   `Table.LatestStreamArn` from the response.
4. **S3 notifications are set via `AwsCustomResource`**
   (`putBucketNotificationConfiguration`) from the data stack, with an
   explicit `lambda.CfnPermission` for the S3→Lambda invoke. The idiomatic
   `bucket.addEventNotification(LambdaDestination)` creates the
   data↔storage cycle.
5. **Env vars carrying data/storage tokens** (`GRAPHQL_ENDPOINT`,
   `STORAGE_BUCKET_NAME`) are safe only because the functions are assigned
   `resourceGroupName: 'data'` in their `defineFunction` — they live in the
   data stack, so the token stays intra-stack. A function without that
   resource group must not receive these tokens.
6. **The post-confirmation trigger (auth stack) never references data-stack
   resources.** It discovers the `User` table at runtime via `ListTables`
   (name prefix match) and uses wildcard IAM — auth→data tokens would cycle
   through auth↔data.

## Current wiring map (see `amplify/backend.ts`)

| # | Wiring | Mechanism |
|---|---|---|
| 1 | DynamoDB streams + EventSourceMappings | `streamEventSources` map (single source of truth: table → consuming Lambdas); `AwsCustomResource` stream-ARN lookup |
| 2 | Stream-read IAM | wildcard ARN on every Lambda in the map |
| 3 | AppSync IAM + `GRAPHQL_ENDPOINT` | wildcard ARN + env var for all trigger functions |
| 4 | S3 upload notifications (`uploads/` prefix) | `AwsCustomResource` + explicit `CfnPermission` → s3-file-trigger |
| 5 | Stripe webhook Function URL | `addFunctionUrl` + `CfnOutput StripeWebhookUrl` |
| 6 | SES bounce/complaint SNS topic | data-stack `sns.Topic` + Lambda subscription + `CfnOutput` |
| 7 | Post-confirmation IAM | wildcard-only policies (DynamoDB PutItem/ListTables, Cognito group ops) |

Vertical extensions: add stream triggers to the `streamEventSources` map;
scheduled jobs are data-stack EventBridge Rules targeting your Lambda (the
original vertical ran a daily-cron expiry checker this way).
