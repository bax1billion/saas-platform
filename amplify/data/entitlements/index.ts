import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Stack } from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';

/**
 * Backend entitlement enforcement (docs/subscriptions-and-payments.md §6).
 *
 * Inserts three APPSYNC_JS pipeline functions — User → Organization →
 * OrgSubscription + decision — into every gated model mutation, right
 * before the generated data resolver (so Cognito group auth has already
 * run). Reads are never gated. IAM callers bypass.
 *
 * Gated fields:
 *   - `create|update|delete<Model>` for each table in `moduleTables`
 *     → requires an active subscription AND that module
 *   - the same three for each table in `subscriptionTables`
 *     → requires an active subscription only
 */

export interface EntitlementEnforcementOptions {
  /** module id → model names owned by that module. */
  moduleTables: Record<string, string[]>;
  /** Foundation org-scoped models that only need an active subscription. */
  subscriptionTables: string[];
}

type DataResources = {
  graphqlApi: appsync.IGraphqlApi;
  cfnResources: {
    cfnResolvers: Record<string, appsync.CfnResolver>;
    cfnDataSources: Record<string, appsync.CfnDataSource>;
  };
};

const here = dirname(fileURLToPath(import.meta.url));
const code = (file: string) => readFileSync(join(here, file), 'utf8');

const MUTATION_PREFIXES = ['create', 'update', 'delete'] as const;

export function applyEntitlementEnforcement(
  data: DataResources,
  options: EntitlementEnforcementOptions
): { gatedFields: string[] } {
  const stack = Stack.of(data.graphqlApi);
  const apiId = data.graphqlApi.apiId;

  // fieldName → required module id (null = subscription only)
  const fieldModule: Record<string, string | null> = {};
  for (const [moduleId, models] of Object.entries(options.moduleTables)) {
    for (const model of models) {
      for (const p of MUTATION_PREFIXES) fieldModule[`${p}${model}`] = moduleId;
    }
  }
  for (const model of options.subscriptionTables) {
    for (const p of MUTATION_PREFIXES) fieldModule[`${p}${model}`] = null;
  }

  const dataSourceByName = (name: string) => {
    const ds = Object.values(data.cfnResources.cfnDataSources).find(
      (d) => d.name === name
    );
    if (!ds) throw new Error(`Entitlements: data source "${name}" not found`);
    return ds;
  };

  const runtime = { name: 'APPSYNC_JS', runtimeVersion: '1.0.0' };
  const makeFn = (id: string, dataSourceName: string, source: string) => {
    const ds = dataSourceByName(dataSourceName);
    const fn = new appsync.CfnFunctionConfiguration(stack, id, {
      apiId,
      name: id,
      dataSourceName,
      runtime,
      code: source,
    });
    fn.addDependency(ds);
    return fn;
  };

  const userFn = makeFn('EntitlementUserFn', 'UserTable', code('user.js'));
  const orgFn = makeFn('EntitlementOrgFn', 'OrganizationTable', code('org.js'));
  const subFn = makeFn(
    'EntitlementSubscriptionFn',
    'OrgSubscriptionTable',
    code('subscription.js').replace('__FIELD_MODULE__', JSON.stringify(fieldModule))
  );
  const inserted = [userFn.attrFunctionId, orgFn.attrFunctionId, subFn.attrFunctionId];

  const gatedFields: string[] = [];
  for (const field of Object.keys(fieldModule)) {
    // cfnResolvers is keyed "<Type>.<field>", e.g. "Mutation.createSite"
    const logicalId = `Mutation.${field}`;
    const resolver = data.cfnResources.cfnResolvers[logicalId];
    if (!resolver) {
      throw new Error(
        `Entitlements: resolver ${logicalId} not found — is the model in the schema?`
      );
    }
    const pipeline = resolver.pipelineConfig as
      | appsync.CfnResolver.PipelineConfigProperty
      | undefined;
    const functions = pipeline?.functions;
    if (!functions || functions.length === 0) {
      throw new Error(`Entitlements: ${logicalId} is not a pipeline resolver`);
    }
    // Keep Amplify's init/auth steps first and its data resolver last.
    const last = functions[functions.length - 1];
    resolver.pipelineConfig = {
      functions: [...functions.slice(0, -1), ...inserted, last],
    };
    gatedFields.push(field);
  }

  return { gatedFields };
}
