import { AmplifyData, AmplifyDataDefinition } from '@aws-amplify/data-construct';
import type { Construct } from 'constructs';
import { NestedStack, Stack, type CfnResource } from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import type { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { StreamViewType, type ITable } from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cr from 'aws-cdk-lib/custom-resources';
import { applyEntitlementEnforcement } from '../entitlements/index';
import { applyRecordAccess, type RecordAccessPolicy } from '../record-access/index';
import { domainStackName, domainUrlParameterName, domainUrlParameterPrefix, type DataDomainId } from './assignments';

/**
 * A data domain is one AppSync API with its own stack tree
 * (docs/data-domains.md § 3.1). This builds one from a composed
 * `a.schema(...)` with the construct Amplify's own `defineData` wraps
 * (`@aws-amplify/data-construct`, the published name of
 * `@aws-amplify/graphql-api-construct`): the schema's SDL becomes the
 * definition, the same Cognito pool and identity pool roles authorize it,
 * and every model gets Amplify's one-nested-stack-per-model shape, which is
 * what keeps a model's pipeline functions out of the domain stack.
 *
 * The per-API steps (entitlements, record access, key stamps) take a
 * `DataResources`-shaped argument; `resources` here is that shape for the
 * domain, with the foundation tables the steps read added as data sources
 * (the entitlement step looks them up by name: `UserTable`,
 * `OrgSubscriptionTable`, `OrgEntitlementOverrideTable`).
 *
 * Proven on a sandbox on 2026-10-11 and on a product's staging and
 * production environments the same week (docs/data-domains.md § 8).
 */

export interface DomainAuth {
  userPool: IUserPool;
  identityPoolId: string;
  authenticatedUserRole: iam.IRole;
  unauthenticatedUserRole: iam.IRole;
}

/** What `a.schema(...)` exposes that the domain needs: the rendered SDL and its Lambda-backed fields. */
export interface DomainSchemaSource {
  transform(): { schema: string; lambdaFunctions: Record<string, unknown> };
}

/** A domain module's function: its defineFunction factory (the registry's object) and the instance defineBackend made of it. */
export interface DomainFunction {
  factory: unknown;
  lambda: lambda.Function;
}

/** What the per-API pipeline steps take: the foundation's `backend.data.resources` or a domain's. */
export interface ApiResources {
  graphqlApi: appsync.IGraphqlApi;
  cfnResources: {
    cfnResolvers: Record<string, appsync.CfnResolver>;
    cfnDataSources: Record<string, appsync.CfnDataSource>;
  };
}
export type DataDomainResources = ApiResources;

export function buildDataDomain(
  scope: Construct,
  id: string,
  props: {
    schema: DomainSchemaSource;
    auth: DomainAuth;
    /** Foundation tables the API's pipeline steps read, by model name. */
    foundationTables: Record<string, ITable>;
    /** The domain modules' functions (instantiated by defineBackend in this stack). */
    functions?: DomainFunction[];
    /** The foundation API's URL, for a function's caller lookup and the foundation's rows. */
    foundationGraphqlUrl?: string;
  }
) {
  const { schema: sdl, lambdaFunctions } = props.schema.transform();
  // `@function(name: "FnWidgetCommand")` in the SDL names the slot;
  // the transform hands the slot's factory back, and the instance is the
  // one defineBackend built from the same object (the registry's).
  const functionNameMap: Record<string, lambda.IFunction> = {};
  for (const [slot, factory] of Object.entries(lambdaFunctions)) {
    const fn = (props.functions ?? []).find((f) => f.factory === factory);
    if (!fn) throw new Error(`${id} domain: the schema's ${slot} names a function that is not among the domain's functions (is its module composed, and its function in the registry?)`);
    functionNameMap[slot] = fn.lambda;
  }
  // Amplify's managed table strategy, as defineData uses: the
  // Custom::AmplifyDynamoDBTable shape whose manager adds indexes without
  // replacing the table and whose wrapper takes the stream specification
  // (a definition without a strategy gives plain CDK tables, and the first
  // sandbox deploy of this domain had those).
  const api = new AmplifyData(scope, `${id}Api`, {
    apiName: `${id}-domain`,
    definition: AmplifyDataDefinition.fromString(sdl, { dbType: 'DYNAMODB', provisionStrategy: 'AMPLIFY_TABLE' }),
    authorizationModes: {
      defaultAuthorizationMode: 'AMAZON_COGNITO_USER_POOLS',
      userPoolConfig: { userPool: props.auth.userPool },
      identityPoolConfig: {
        identityPoolId: props.auth.identityPoolId,
        authenticatedUserRole: props.auth.authenticatedUserRole,
        unauthenticatedUserRole: props.auth.unauthenticatedUserRole,
      },
      // As defineData sets it: a Lambda with an appsync:GraphQL grant may
      // call this API over IAM (the generated auth step has no IAM branch
      // without it; the first sandbox run showed the branch missing).
      iamConfig: { enableIamAuthorizationMode: true },
    },
    functionNameMap,
    translationBehavior: {
      sandboxModeEnabled: false,
      // As Amplify sets it for defineData: the CI/CD check, not the
      // template, decides whether a table replacement goes ahead.
      allowDestructiveGraphqlSchemaUpdates: true,
    },
  });

  // A domain module's function calls this API for its own rows and the
  // foundation API for the caller and the foundation's rows (docs/data-domains.md
  // § 3.4). Both grants are patterns on the account, as backend.ts writes
  // them, so neither stack references the other's API by ARN.
  const stack = Stack.of(scope);
  for (const { lambda: fn } of props.functions ?? []) {
    if (Stack.of(fn) !== stack) {
      throw new Error(`${id} domain: ${fn.node.id} must declare resourceGroupName '${stack.node.id}' so it shares the domain's stack (amplify/data/domains/assignments.ts domainStackName).`);
    }
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['appsync:GraphQL'],
        resources: [`arn:aws:appsync:${stack.region}:${stack.account}:apis/*/types/*/fields/*`],
      })
    );
    if (props.foundationGraphqlUrl) fn.addEnvironment('GRAPHQL_ENDPOINT', props.foundationGraphqlUrl);
    fn.addEnvironment('DATA_DOMAIN_ENDPOINTS', JSON.stringify({ [id]: api.graphqlUrl }));
  }

  const cfnDataSources: Record<string, appsync.CfnDataSource> = {
    ...api.resources.cfnResources.cfnDataSources,
  };
  for (const [model, table] of Object.entries(props.foundationTables)) {
    const name = `${model}Table`;
    const ds = api.addDynamoDbDataSource(`${model}FoundationSource`, table, { name });
    // The table comes from another stack by name, so CDK's grant covers the
    // table ARN alone; the steps query its indexes (usersByCognitoSub,
    // orgSubscriptionsByOrgIdAndSortDate, ...), and the first sandbox run
    // failed on exactly that ("not authorized to perform: dynamodb:Query on
    // .../index/usersByCognitoSub"). Read-only on the table and its indexes.
    ds.grantPrincipal.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:Query', 'dynamodb:GetItem', 'dynamodb:BatchGetItem', 'dynamodb:Scan'],
        resources: [table.tableArn, `${table.tableArn}/index/*`],
      })
    );
    cfnDataSources[name] = ds.node.defaultChild as appsync.CfnDataSource;
  }

  const resources: DataDomainResources = {
    graphqlApi: api.resources.graphqlApi,
    cfnResources: {
      cfnResolvers: api.resources.cfnResources.cfnResolvers,
      cfnDataSources,
    },
  };

  return { api, sdl, resources };
}

/**
 * Streams a domain's tables to their consumers (the foundation event
 * logger for the audit trail, a module's own handlers later), the way
 * amplify/backend.ts #1 does for the foundation API and under the same
 * rules: the stream-ARN lookups live in a `streams` nested stack under
 * the domain stack with one shared role (IAM caps a role's inline
 * policies, and every lookup given its own `policy` adds one); the
 * EventSourceMappings stay in the domain stack and never move (Lambda
 * allows one mapping per stream and function, and CloudFormation creates
 * before it deletes). The lookup re-resolves on every deploy because the
 * table manager can replace a stream when it updates a table. A consumer
 * reads streams through the wildcard grant backend.ts gives it.
 */
export function attachDomainStreams(
  domainStack: Stack,
  api: AmplifyData,
  streamSources: Record<string, lambda.IFunction[]>,
  options: { /** Consumers that already hold the stream-read grant (the foundation's event logger). */ alreadyGranted?: ReadonlyArray<lambda.IFunction> } = {}
) {
  const { amplifyDynamoDbTables } = api.resources.cfnResources;
  const tables = Object.keys(streamSources).filter((t) => streamSources[t].length > 0);
  if (tables.length === 0) return { mappings: 0 };

  const streamStack = new NestedStack(domainStack, 'streams');
  const lookupRole = new iam.Role(streamStack, 'StreamLookupRole', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    description: "Reads each table's stream ARN at deploy (DescribeTable) for the event source mappings.",
    managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
    inlinePolicies: {
      describe: new iam.PolicyDocument({
        statements: [new iam.PolicyStatement({ actions: ['dynamodb:DescribeTable'], resources: ['*'] })],
      }),
    },
  });

  // Every consumer reads streams through the same account-wide pattern
  // backend.ts gives the foundation's consumers (no cross-stack reference);
  // Lambda refuses a mapping for a role that cannot read the stream.
  const granted = new Set(options.alreadyGranted ?? []);
  const consumers = new Set(tables.flatMap((t) => streamSources[t]).filter((fn) => !granted.has(fn)));
  for (const fn of consumers) {
    if (!(fn instanceof lambda.Function)) throw new Error(`attachDomainStreams: ${fn.node.id} is not a Function this backend made; grant it stream reads yourself`);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetRecords', 'dynamodb:GetShardIterator', 'dynamodb:DescribeStream', 'dynamodb:ListStreams'],
        resources: [`arn:aws:dynamodb:${domainStack.region}:${domainStack.account}:table/*/stream/*`],
      })
    );
  }

  let mappings = 0;
  for (const tableName of tables) {
    const wrapper = amplifyDynamoDbTables[tableName];
    if (!wrapper) throw new Error(`attachDomainStreams: ${tableName} is not a model of this domain (models: ${Object.keys(api.resources.tables).join(', ') || 'none'})`);
    wrapper.streamSpecification = { streamViewType: StreamViewType.NEW_AND_OLD_IMAGES };
    const dynamoTableName = ((wrapper as unknown as { resource: CfnResource }).resource).ref;
    const describeCall: cr.AwsSdkCall = {
      service: 'DynamoDB',
      action: 'describeTable',
      parameters: { TableName: dynamoTableName },
      physicalResourceId: cr.PhysicalResourceId.of(`${tableName}-stream`),
      outputPaths: ['Table.LatestStreamArn'],
    };
    const lookup = new cr.AwsCustomResource(streamStack, `${tableName}StreamLookup`, {
      onCreate: describeCall,
      onUpdate: describeCall,
      role: lookupRole,
    });
    (lookup.node.findChild('Resource').node.defaultChild as CfnResource).addPropertyOverride('ResolvedAt', new Date().toISOString());
    const streamArn = lookup.getResponseField('Table.LatestStreamArn');
    streamSources[tableName].forEach((fn, i) => {
      new lambda.EventSourceMapping(domainStack, `${tableName}Stream${i}`, {
        target: fn,
        eventSourceArn: streamArn,
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
      });
      mappings += 1;
    });
  }
  return { mappings };
}

/** A domain as the registry describes it (amplify/data/vertical.ts `domainContribution`), with its schema. */
export interface DomainDefinition {
  id: DataDomainId;
  modules: string[];
  schema: DomainSchemaSource;
  moduleTables: Record<string, string[]>;
  sharedModuleTables: Record<string, string[]>;
  moduleMutations: Record<string, string[]>;
  functions: Record<string, unknown>;
  streamTables: string[];
  streamConsumers: Record<string, string[]>;
  recordAccess: RecordAccessPolicy[];
  apiSteps: ReadonlyArray<(resources: ApiResources) => void | { gatedFields: string[] }>;
}

export interface WiredDomain {
  id: DataDomainId;
  stack: Stack;
  api: AmplifyData;
  resources: ApiResources;
  graphqlUrl: string;
  functions: Record<string, lambda.Function>;
}

/**
 * Builds every composed data domain (docs/data-domains.md § 3): the API in
 * its stack, the entitlement and record-access steps with the foundation's
 * tables, the modules' own pipeline steps, the audit stream to the event
 * logger plus the modules' stream handlers, the URL in the outputs and in
 * an SSM parameter for the foundation's Lambdas. The backend calls this
 * once; a new domain is a registry line.
 */
export function wireDataDomains(props: {
  domains: DomainDefinition[];
  rootStackName: string;
  /** The function instance defineBackend made for a construct name. */
  functionByKey: (key: string) => lambda.Function;
  createStack: (name: string) => Stack;
  addOutput: (output: { custom: Record<string, unknown> }) => void;
  auth: DomainAuth;
  foundation: {
    graphqlUrl: string;
    tables: Record<string, ITable>;
    eventLogger: lambda.IFunction;
  };
}): Record<string, WiredDomain> {
  const wired: Record<string, WiredDomain> = {};
  for (const domain of props.domains) {
    // The domain's functions declare the domain stack as their resource
    // group, so defineBackend has already made it when there are any; a
    // domain with none gets it created here.
    const functions = Object.fromEntries(Object.keys(domain.functions).map((key) => [key, props.functionByKey(key)]));
    const first = Object.values(functions)[0];
    const stack = first ? Stack.of(first) : props.createStack(domainStackName(domain.id));
    const built = buildDataDomain(stack, domain.id, {
      schema: domain.schema,
      auth: props.auth,
      foundationTables: {
        User: props.foundation.tables['User'],
        OrgSubscription: props.foundation.tables['OrgSubscription'],
        OrgEntitlementOverride: props.foundation.tables['OrgEntitlementOverride'],
      },
      functions: Object.entries(functions).map(([key, fn]) => ({ factory: domain.functions[key], lambda: fn })),
      foundationGraphqlUrl: props.foundation.graphqlUrl,
    });

    const entitlements = applyEntitlementEnforcement(built.resources, {
      moduleTables: domain.moduleTables,
      sharedModuleTables: domain.sharedModuleTables,
      moduleMutations: domain.moduleMutations,
      subscriptionTables: [],
    });
    const access = applyRecordAccess(built.resources, domain.recordAccess);
    for (const step of domain.apiSteps) step(built.resources);
    console.log(
      `${domain.id} domain: ${domain.modules.join(', ')}; entitlement enforcement on ${entitlements.gatedFields.length} mutations, record access on ${access.gatedFields.length} fields, ${domain.apiSteps.length} module steps`
    );

    // Streams: the audit tables to the event logger, and each table to the
    // domain's own handlers. A handler must be one of this domain's
    // functions; a consumer in another stack would be a cross-stack mapping.
    const streamSources: Record<string, lambda.IFunction[]> = {};
    for (const table of domain.streamTables) streamSources[table] = [props.foundation.eventLogger];
    for (const [table, keys] of Object.entries(domain.streamConsumers)) {
      for (const key of keys) {
        const fn = functions[key];
        if (!fn) throw new Error(`${domain.id} domain: ${table} names stream consumer "${key}", which is not a function of a module on this domain`);
        (streamSources[table] ??= []).push(fn);
      }
    }
    const streams = attachDomainStreams(stack, built.api, streamSources, { alreadyGranted: [props.foundation.eventLogger] });
    console.log(`${domain.id} domain streams ${Object.keys(streamSources).length} tables (${streams.mappings} mappings)`);

    // The URL: the client reads it from the outputs; the foundation's own
    // Lambdas read it from SSM at run time (a token here would make the
    // data stack depend on this one).
    new ssm.StringParameter(stack, 'DomainUrlParameter', {
      parameterName: domainUrlParameterName(props.rootStackName, domain.id),
      stringValue: built.api.graphqlUrl,
      description: `The ${domain.id} data domain's GraphQL URL (docs/data-domains.md).`,
    });
    props.addOutput({ custom: { dataDomains: { [domain.id]: { url: built.api.graphqlUrl, region: stack.region } } } });

    wired[domain.id] = { id: domain.id, stack, api: built.api, resources: built.resources, graphqlUrl: built.api.graphqlUrl, functions };
  }
  return wired;
}

/**
 * Lets a foundation Lambda (an export provider, an Assist helper) resolve a
 * domain's URL at run time: the SSM prefix in its environment and the
 * read grant on it. `amplify/shared/graphql.ts` does the lookup.
 */
export function grantDomainUrlLookup(fn: lambda.Function, rootStackName: string) {
  const stack = Stack.of(fn);
  fn.addEnvironment('DATA_DOMAIN_PARAMETER_PREFIX', domainUrlParameterPrefix(rootStackName));
  fn.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${stack.region}:${stack.account}:parameter${domainUrlParameterPrefix(rootStackName)}/*`],
    })
  );
}
