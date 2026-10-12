import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import type { Construct } from 'constructs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Sandbox seed (docs/bootstrap.md "Seeding a sandbox"): organizations and
 * signed-in users written at deploy time, so a sandbox can be exercised by
 * a script without admin rights on Cognito or DynamoDB (the sandbox
 * account's deploy role has neither; the deploy itself does). Enabled by
 * SANDBOX_SEED=1 with SANDBOX_SEED_PASSWORD; refused on a deployed branch.
 * The rows and users are removed when the resource is (SANDBOX_SEED unset
 * on the next deploy, or the stack deleted). Nothing here is product data.
 */
export interface SeedOrganization {
  id: string;
  name: string;
  slug: string;
  /** Module ids on the ACTIVE subscription row. */
  modules: string[];
  /** The organization's users, each in one Cognito group. */
  users: { email: string; group: 'Admin' | 'Member' | 'Viewer' }[];
}

const here = dirname(fileURLToPath(import.meta.url));

export function createSandboxSeed(
  scope: Construct,
  props: {
    userPool: cognito.IUserPool;
    tables: { User: dynamodb.ITable; Organization: dynamodb.ITable; OrgSubscription: dynamodb.ITable };
    organizations: SeedOrganization[];
    password: string;
  }
) {
  const fn = new lambda.Function(scope, 'SandboxSeedHandler', {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromAsset(join(here, 'handler')),
    timeout: Duration.seconds(60),
    description: 'Sandbox-only: seeds smoke-test organizations and users at deploy.',
  });
  fn.addToRolePolicy(
    new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminDeleteUser',
      ],
      resources: [props.userPool.userPoolArn],
    })
  );
  for (const table of Object.values(props.tables)) table.grantWriteData(fn);

  const provider = new cr.Provider(scope, 'SandboxSeedProvider', { onEventHandler: fn });
  const resource = new CustomResource(scope, 'SandboxSeed', {
    serviceToken: provider.serviceToken,
    properties: {
      userPoolId: props.userPool.userPoolId,
      tables: {
        User: props.tables.User.tableName,
        Organization: props.tables.Organization.tableName,
        OrgSubscription: props.tables.OrgSubscription.tableName,
      },
      organizations: props.organizations,
      password: props.password,
      region: Stack.of(scope).region,
    },
  });
  return { fn, resource };
}
