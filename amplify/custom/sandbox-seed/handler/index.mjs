// Sandbox seed handler (amplify/custom/sandbox-seed/resource.ts). Runs on
// the Node 22 runtime with the AWS SDK v3 it ships; no bundling.
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { DeleteItemCommand, DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const cognito = new CognitoIdentityProviderClient({});
const ddb = new DynamoDBClient({});

async function ensureUser(pool, email, group, password) {
  let sub;
  try {
    const u = await cognito.send(new AdminGetUserCommand({ UserPoolId: pool, Username: email }));
    sub = u.UserAttributes.find((a) => a.Name === "sub").Value;
  } catch (e) {
    if (e.name !== "UserNotFoundException") throw e;
    const u = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: pool,
        Username: email,
        MessageAction: "SUPPRESS",
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
        ],
      })
    );
    sub = u.User.Attributes.find((a) => a.Name === "sub").Value;
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: pool, Username: email, GroupName: group }));
  }
  await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: pool, Username: email, Password: password, Permanent: true }));
  return sub;
}

const put = (table, item) => ddb.send(new PutItemCommand({ TableName: table, Item: marshall(item, { removeUndefinedValues: true }) }));
const del = (table, id) => ddb.send(new DeleteItemCommand({ TableName: table, Key: marshall({ id }) }));

export const handler = async (event) => {
  const p = event.ResourceProperties;
  const physical = "sandbox-seed";
  if (event.RequestType === "Delete") {
    for (const org of p.organizations) {
      await del(p.tables.Organization, org.id);
      await del(p.tables.OrgSubscription, `${org.id}-sub`);
      for (const [i, u] of org.users.entries()) {
        await del(p.tables.User, i === 0 ? `${org.id}-user` : `${org.id}-user-${u.group.toLowerCase()}`);
        try {
          await cognito.send(new AdminDeleteUserCommand({ UserPoolId: p.userPoolId, Username: u.email }));
        } catch (e) {
          if (e.name !== "UserNotFoundException") throw e;
        }
      }
    }
    return { PhysicalResourceId: physical };
  }
  const now = new Date().toISOString();
  const stamp = { createdAt: now, updatedAt: now, sortDate: now };
  const seeded = [];
  for (const org of p.organizations) {
    await put(p.tables.Organization, { id: org.id, __typename: "Organization", name: org.name, slug: org.slug, isActive: true, ...stamp });
    await put(p.tables.OrgSubscription, {
      id: `${org.id}-sub`,
      __typename: "OrgSubscription",
      orgId: org.id,
      stripeSubscriptionId: `${org.id}-sub`,
      stripeCustomerId: `${org.id}-cus`,
      stripePriceId: `${org.id}-price`,
      tier: "CORE",
      status: "ACTIVE",
      modules: org.modules,
      ...stamp,
    });
    for (const [i, u] of org.users.entries()) {
      const sub = await ensureUser(p.userPoolId, u.email, u.group, p.password);
      // The first user keeps the original id so earlier seeds are replaced, not duplicated.
      const id = i === 0 ? `${org.id}-user` : `${org.id}-user-${u.group.toLowerCase()}`;
      await put(p.tables.User, {
        id,
        __typename: "User",
        orgId: org.id,
        cognitoSub: sub,
        email: u.email,
        firstName: "Smoke",
        lastName: u.group,
        role: u.group,
        isActive: true,
        ...stamp,
      });
      seeded.push(`${id}:${sub}`);
    }
  }
  return { PhysicalResourceId: physical, Data: { seeded: seeded.join(",") } };
};
