import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  GetGroupCommand,
  CreateGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomUUID } from 'crypto';
import { DEFAULT_GROUP } from '../../shared/constants';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const cognitoClient = new CognitoIdentityProviderClient({});

// Table name cache — discovered at runtime via ListTables to avoid
// cross-stack CloudFormation references (auth → data would create a cycle).
//
// Known issue (dev sandboxes sharing one AWS account only — see below):
// ListTables is account-wide. If more than one developer's sandbox is live
// in the same account at once, each has its own User-*-NONE table, and
// `.find()` below can pick a *different* developer's table instead of this
// deployment's own — new sign-ups then silently write to the wrong table,
// so provisionOrganization's usersByCognitoSub (correctly bound via AppSync
// to *this* deployment's table) never finds the row: "User record not
// found." Confirmed on 2026-09-27: 5 User-* tables existed in the account
// at once.
//
// Not a concern in production (one deployment, one User-* table, `.find()`
// always resolves correctly) or for a sandbox whose users were already
// created before hitting this — the mismatch only bites a *fresh* sign-up
// made while the account is in this multi-sandbox state.
//
// If this recurs, the fix that was proven to work (then reverted here
// since it's dev-only churn, not worth carrying permanently):
//   1. Grant this function `cloudformation:ListStackResources` (a runtime
//      IAM permission — not a CDK/template reference, so it can't create
//      the auth↔data cycle below) and pass its own root stack name as a
//      plain env var: `postConfirmationLambda.addEnvironment(
//      'SANDBOX_STACK_NAME', backend.stack.stackName)` in amplify/backend.ts
//      (backend.stack.stackName is a plain string — the root's own name,
//      not a cross-stack attribute read, so it's safe the same way
//      `uniqueName: backend.stack.stackName` already is elsewhere there).
//   2. At runtime, recursively call ListStackResources from that root stack
//      name down (bounded depth — 5 was enough to cover nested stacks),
//      collecting every physical resource ID that's actually part of this
//      deployment, then pick whichever User-* candidate appears in that set.
// What does NOT work, so don't re-try these:
//   - DynamoDB table tags: Amplify's custom table-manager resource only
//     applies generic tags (amplify:deployment-type, amplify:friendly-name,
//     created-by) identical across every sandbox — no unique identifier.
//   - Giving this function GRAPHQL_ENDPOINT (attrGraphQlUrl) directly: this
//     broke the deploy with CloudformationStackCircularDependencyError,
//     because Data already depends on Auth for its Cognito authorizer, and
//     reading Data's AppSync attribute from an Auth-resident function adds
//     the reverse edge, completing the cycle.
let userTableName: string;

async function getTableName() {
  if (userTableName) return;

  const tables: string[] = [];
  let lastTable: string | undefined;
  do {
    const result = await ddbClient.send(
      new ListTablesCommand({ ExclusiveStartTableName: lastTable })
    );
    tables.push(...(result.TableNames || []));
    lastTable = result.LastEvaluatedTableName;
  } while (lastTable);

  userTableName = tables.find((t) => t.startsWith('User-'))!;

  if (!userTableName) {
    throw new Error(
      `User table not found. Available: ${tables.join(', ')}`
    );
  }
}

async function addUserToGroup(
  userPoolId: string,
  username: string,
  groupName: string
) {
  const groupParams = { GroupName: groupName, UserPoolId: userPoolId };

  try {
    await cognitoClient.send(new GetGroupCommand(groupParams));
  } catch {
    await cognitoClient.send(new CreateGroupCommand(groupParams));
  }

  await cognitoClient.send(
    new AdminAddUserToGroupCommand({
      GroupName: groupName,
      UserPoolId: userPoolId,
      Username: username,
    })
  );
}

export const handler: PostConfirmationTriggerHandler = async (event) => {
  console.log('PostConfirmation event:', JSON.stringify(event));

  const { userName, userPoolId } = event;
  const { email, sub } = event.request.userAttributes;
  const now = new Date().toISOString();

  await getTableName();

  // 1. Create a minimal User record (no org — completed during onboarding)
  console.log('Creating user record', { sub, email, table: userTableName });
  await ddb.send(
    new PutCommand({
      TableName: userTableName,
      Item: {
        id: randomUUID(),
        cognitoSub: sub,
        email,
        isActive: true,
        sortDate: now,
        createdAt: now,
        updatedAt: now,
        __typename: 'User',
      },
    })
  );
  console.log('User record created');

  // 2. Add user to the default group.
  //    Elevated to Admin when they create/join an org during onboarding.
  console.log(`Adding user to ${DEFAULT_GROUP} group`);
  await addUserToGroup(userPoolId, userName, DEFAULT_GROUP);
  console.log(`User added to ${DEFAULT_GROUP} group`);

  return event;
};
