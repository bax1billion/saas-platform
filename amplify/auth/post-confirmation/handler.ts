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
  console.log('Creating user record', { sub, email });
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
