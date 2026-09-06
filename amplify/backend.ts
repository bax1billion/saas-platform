import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { eventLoggerFunction } from './functions/event-logger/resource';
import { organizationTriggerFunction } from './functions/organization-trigger/resource';
import { s3FileTriggerFunction } from './functions/s3-file-trigger/resource';
import { newsletterSubscriberTriggerFunction } from './functions/newsletter-subscriber-trigger/resource';
import { sesWebhookHandlerFunction } from './functions/ses-webhook-handler/resource';
import { stripeWebhookHandlerFunction } from './functions/stripe-webhook-handler/resource';
import { createCheckoutSessionFunction } from './functions/create-checkout-session/resource';
import { createOrganizationFunction } from './functions/create-organization/resource';
import { getMediaUrlsFunction } from './functions/get-media-urls/resource';
import { postConfirmation } from './auth/post-confirmation/resource';
import { verticalStreamTables, verticalModuleTables } from './data/vertical';
import { createMediaCdn } from './custom/media-cdn/resource';
import { applyEntitlementEnforcement } from './data/entitlements/index';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { CfnOutput, CfnResource, Stack } from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';

const backend = defineBackend({
  auth,
  data,
  storage,
  postConfirmation,
  eventLoggerFunction,
  organizationTriggerFunction,
  s3FileTriggerFunction,
  newsletterSubscriberTriggerFunction,
  sesWebhookHandlerFunction,
  stripeWebhookHandlerFunction,
  createCheckoutSessionFunction,
  createOrganizationFunction,
  getMediaUrlsFunction,
});

// ═══════════════════════════════════════════════════════════════════
// #1 DynamoDB Streams → Lambda triggers
// Single source of truth: table name → consuming Lambdas. Streams are
// enabled on exactly these tables and EventSourceMappings derived from
// the same map. Verticals add their tables here (typically with at least
// the event-logger for the audit trail).
// ═══════════════════════════════════════════════════════════════════

const { amplifyDynamoDbTables } = backend.data.resources.cfnResources;
const dataStack = Stack.of(backend.data.resources.graphqlApi);

const streamEventSources: Record<string, lambda.IFunction[]> = {
  Organization: [
    backend.eventLoggerFunction.resources.lambda,
    backend.organizationTriggerFunction.resources.lambda,
  ],
  User: [backend.eventLoggerFunction.resources.lambda],
  Site: [backend.eventLoggerFunction.resources.lambda],
  OrgSubscription: [backend.eventLoggerFunction.resources.lambda],
  OrgEntitlementOverride: [backend.eventLoggerFunction.resources.lambda],
  NewsletterSubscriber: [
    backend.eventLoggerFunction.resources.lambda,
    backend.newsletterSubscriberTriggerFunction.resources.lambda,
  ],
  // Vertical tables (amplify/data/vertical.ts) → audit trail
  ...Object.fromEntries(
    verticalStreamTables.map((t) => [
      t,
      [backend.eventLoggerFunction.resources.lambda],
    ])
  ),
};

for (const tableName of Object.keys(streamEventSources)) {
  amplifyDynamoDbTables[tableName].streamSpecification = {
    streamViewType: StreamViewType.NEW_AND_OLD_IMAGES,
  };
}

// EventSourceMappings use an AwsCustomResource to look up stream ARNs at
// deploy time, since Custom::AmplifyDynamoDBTable doesn't expose StreamArn.
for (const [tableName, functions] of Object.entries(streamEventSources)) {
  const dynamoTableName = (
    (amplifyDynamoDbTables[tableName] as any).resource as CfnResource
  ).ref;

  const describeCall: cr.AwsSdkCall = {
    service: 'DynamoDB',
    action: 'describeTable',
    parameters: { TableName: dynamoTableName },
    physicalResourceId: cr.PhysicalResourceId.of(`${tableName}-stream`),
    outputPaths: ['Table.LatestStreamArn'],
  };

  const streamLookup = new cr.AwsCustomResource(
    dataStack,
    `${tableName}StreamLookup`,
    {
      onCreate: describeCall,
      onUpdate: describeCall,
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['dynamodb:DescribeTable'],
          resources: ['*'],
        }),
      ]),
    }
  );

  const streamArn = streamLookup.getResponseField('Table.LatestStreamArn');

  for (let i = 0; i < functions.length; i++) {
    new lambda.EventSourceMapping(dataStack, `${tableName}Stream${i}`, {
      target: functions[i],
      eventSourceArn: streamArn,
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 10,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// #2 IAM: DynamoDB Stream Read
// Wildcard stream ARNs — no cross-stack refs (avoids circular deps).
// ═══════════════════════════════════════════════════════════════════

const dynamoDbStreamWildcard = `arn:aws:dynamodb:${backend.stack.region}:${backend.stack.account}:table/*/stream/*`;

const streamConsumerLambdas = new Set(
  Object.values(streamEventSources).flat()
);

for (const fn of streamConsumerLambdas) {
  fn.addToRolePolicy(
    new iam.PolicyStatement({
      actions: [
        'dynamodb:GetRecords',
        'dynamodb:GetShardIterator',
        'dynamodb:DescribeStream',
        'dynamodb:ListStreams',
      ],
      resources: [dynamoDbStreamWildcard],
    })
  );
}

// ═══════════════════════════════════════════════════════════════════
// #3 IAM: AppSync Access + GraphQL endpoint env var
// ═══════════════════════════════════════════════════════════════════

const appsyncWildcard = `arn:aws:appsync:${backend.stack.region}:${backend.stack.account}:apis/*/types/*/fields/*`;

const allTriggerFunctions = [
  backend.eventLoggerFunction,
  backend.organizationTriggerFunction,
  backend.s3FileTriggerFunction,
  backend.newsletterSubscriberTriggerFunction,
  backend.sesWebhookHandlerFunction,
  backend.stripeWebhookHandlerFunction,
  backend.createCheckoutSessionFunction,
  backend.createOrganizationFunction,
  backend.getMediaUrlsFunction,
];

// The GraphQL hostname is its own identifier — NOT the apiId. Building
// the URL from apiId resolves to a nonexistent host and every Lambda
// callback into AppSync dies with undici's "fetch failed".
const graphqlEndpoint =
  backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlUrl;

for (const fn of allTriggerFunctions) {
  fn.resources.lambda.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['appsync:GraphQL'],
      resources: [appsyncWildcard],
    })
  );
  (fn.resources.lambda as lambda.Function).addEnvironment(
    'GRAPHQL_ENDPOINT',
    graphqlEndpoint
  );
}

// Checkout session handler needs the app URL for Stripe return_url.
// Set APP_URL per environment (Amplify console env var or shell env for
// `ampx sandbox`); localhost fallback keeps sandboxes working out of the box.
(backend.createCheckoutSessionFunction.resources.lambda as lambda.Function).addEnvironment(
  'APP_URL',
  process.env.APP_URL ?? 'http://localhost:3000'
);

// Onboarding handler elevates the org creator to Admin. The data stack
// already depends on auth (user-pool auth mode), so referencing the pool
// id here adds no new edge to the stack graph; the IAM grant stays a
// wildcard for the same reason as #7.
const createOrgLambda = backend.createOrganizationFunction.resources
  .lambda as lambda.Function;
createOrgLambda.addEnvironment(
  'USER_POOL_ID',
  backend.auth.resources.userPool.userPoolId
);
createOrgLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['cognito-idp:AdminAddUserToGroup'],
    resources: [
      `arn:aws:cognito-idp:${backend.stack.region}:${backend.stack.account}:userpool/*`,
    ],
  })
);

// ═══════════════════════════════════════════════════════════════════
// #3b Backend entitlement enforcement
// APPSYNC_JS pipeline steps on every gated model mutation: the caller's
// org must have an access-granting subscription (or be comped), and module
// tables additionally require the module. Reads are never gated; IAM
// callers (Lambdas) bypass. See amplify/data/entitlements/.
// ═══════════════════════════════════════════════════════════════════

const entitlements = applyEntitlementEnforcement(backend.data.resources, {
  moduleTables: verticalModuleTables,
  subscriptionTables: ['Site'],
});
console.log(
  `Entitlement enforcement on ${entitlements.gatedFields.length} mutations`
);

// ═══════════════════════════════════════════════════════════════════
// #4 S3 Event Notifications
// Uses AwsCustomResource to set bucket notifications from the data
// stack, avoiding the data↔storage circular dependency that
// bucket.addEventNotification(LambdaDestination) would create.
// ═══════════════════════════════════════════════════════════════════

const bucket = backend.storage.resources.bucket;
const s3TriggerLambda =
  backend.s3FileTriggerFunction.resources.lambda as lambda.Function;

// Prefixes routed through the validation pipeline (must exist in
// amplify/storage/resource.ts)
const validatedUploadPrefixes = ['uploads/'];

// Lambda permission: allow S3 to invoke the trigger
const s3InvokePermission = new lambda.CfnPermission(
  dataStack,
  'S3InvokePermission',
  {
    action: 'lambda:InvokeFunction',
    functionName: s3TriggerLambda.functionName,
    principal: 's3.amazonaws.com',
    sourceAccount: dataStack.account,
  }
);

s3TriggerLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['s3:GetObject'],
    resources: [`arn:aws:s3:::*/*`],
  })
);

s3TriggerLambda.addEnvironment('STORAGE_BUCKET_NAME', bucket.bucketName);

// S3 event notifications via AwsCustomResource (one-way data→storage dep)
const notificationConfig = {
  Bucket: bucket.bucketName,
  NotificationConfiguration: {
    LambdaFunctionConfigurations: validatedUploadPrefixes.map(
      (prefix, i) => ({
        Id: `s3-trigger-${i}`,
        Events: ['s3:ObjectCreated:*'],
        LambdaFunctionArn: s3TriggerLambda.functionArn,
        Filter: {
          Key: { FilterRules: [{ Name: 'prefix', Value: prefix }] },
        },
      })
    ),
  },
};

const s3NotifyCall: cr.AwsSdkCall = {
  service: 'S3',
  action: 'putBucketNotificationConfiguration',
  parameters: notificationConfig,
  physicalResourceId: cr.PhysicalResourceId.of('S3EventNotifications'),
};

const s3Notifications = new cr.AwsCustomResource(
  dataStack,
  'S3EventNotifications',
  {
    onCreate: s3NotifyCall,
    onUpdate: s3NotifyCall,
    onDelete: {
      service: 'S3',
      action: 'putBucketNotificationConfiguration',
      parameters: {
        Bucket: bucket.bucketName,
        NotificationConfiguration: {},
      },
    },
    policy: cr.AwsCustomResourcePolicy.fromStatements([
      new iam.PolicyStatement({
        actions: [
          's3:PutBucketNotificationConfiguration',
          's3:PutBucketNotification',
        ],
        resources: [`arn:aws:s3:::*`],
      }),
    ]),
  }
);

// Ensure Lambda Permission exists before S3 validates the notification
s3Notifications.node.addDependency(s3InvokePermission);

// ═══════════════════════════════════════════════════════════════════
// #4b Media CDN (docs/image-delivery.md)
// CloudFront + sharp Lambda + transformed-derivative bucket over the
// storage bucket's media prefixes. Fail-closed: serves 403s until either
// MEDIA_CDN_PUBLIC_KEY (signed URLs, P2) or MEDIA_CDN_ALLOW_OPEN=1
// (sandbox testing only) is provided at synth.
// ═══════════════════════════════════════════════════════════════════

const mediaCdnStack = backend.createStack('media-cdn');
const mediaCdn = createMediaCdn(mediaCdnStack, {
  originalsBucket: backend.storage.resources.bucket,
  allowedPrefixes: ['uploads/', 'logos/'],
  allowOpen: process.env.MEDIA_CDN_ALLOW_OPEN === '1',
  publicKeyPem: process.env.MEDIA_CDN_PUBLIC_KEY,
});

// URL signer (getMediaAccess query) needs the distribution identity.
const getMediaUrlsLambda = backend.getMediaUrlsFunction.resources
  .lambda as lambda.Function;
getMediaUrlsLambda.addEnvironment('MEDIA_CDN_DOMAIN', mediaCdn.domain);
getMediaUrlsLambda.addEnvironment('MEDIA_CDN_KEY_PAIR_ID', mediaCdn.keyPairId);

// ═══════════════════════════════════════════════════════════════════
// #5 Stripe Function URL
// ═══════════════════════════════════════════════════════════════════

const stripeWebhookUrl =
  backend.stripeWebhookHandlerFunction.resources.lambda.addFunctionUrl({
    authType: lambda.FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: ['*'],
      allowedMethods: [lambda.HttpMethod.POST],
    },
  });

new CfnOutput(backend.stack, 'StripeWebhookUrl', {
  value: stripeWebhookUrl.url,
  description: 'Stripe webhook endpoint URL — configure in Stripe Dashboard',
});

// ═══════════════════════════════════════════════════════════════════
// #6 SNS Topic + Lambda Subscription (SES bounce/complaint events)
// Scoped to data stack to avoid data→parent circular dependency.
// ═══════════════════════════════════════════════════════════════════

const sesNotificationTopic = new sns.Topic(
  dataStack,
  'SESNotificationTopic'
);

sesNotificationTopic.addSubscription(
  new snsSubscriptions.LambdaSubscription(
    backend.sesWebhookHandlerFunction.resources.lambda
  )
);

new CfnOutput(dataStack, 'SESNotificationTopicArn', {
  value: sesNotificationTopic.topicArn,
  description:
    'SNS topic ARN — configure as SES bounce/complaint notification destination',
});

// Vertical scheduled jobs: create an aws-events Rule in the dataStack
// targeting your Lambda, e.g.
//   new events.Rule(dataStack, 'DailyCheck', {
//     schedule: events.Schedule.cron({ minute: '0', hour: '6' }),
//   }).addTarget(new targets.LambdaFunction(myFn.resources.lambda));

// ═══════════════════════════════════════════════════════════════════
// #7 PostConfirmation trigger IAM
// Uses wildcard ARNs only — no cross-stack refs — to avoid the
// auth↔data↔storage circular dependency.
// Table names are discovered at runtime via ListTables.
// ═══════════════════════════════════════════════════════════════════

const postConfirmationLambda = backend.postConfirmation.resources.lambda;

postConfirmationLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['dynamodb:PutItem'],
    resources: [
      `arn:aws:dynamodb:${backend.stack.region}:${backend.stack.account}:table/*`,
    ],
  })
);

postConfirmationLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['dynamodb:ListTables'],
    resources: ['*'],
  })
);

postConfirmationLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: [
      'cognito-idp:AdminAddUserToGroup',
      'cognito-idp:GetGroup',
      'cognito-idp:CreateGroup',
    ],
    resources: [
      `arn:aws:cognito-idp:${backend.stack.region}:${backend.stack.account}:userpool/*`,
    ],
  })
);
