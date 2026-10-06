import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Stack } from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';

/**
 * Record-level access enforcement (docs/record-access.md).
 *
 * Group rules answer "may this role touch this model?"; this engine answers
 * "may this caller touch this *record*?" — server-side, in the same
 * APPSYNC_JS pipeline the entitlement gate uses, so the client cannot
 * bypass it. A policy names a **root** model (the record that carries the
 * access decision) and its **children** (rows keyed to the root by a
 * foreign key); the product supplies the decision as a JS snippet defining
 *
 *   canView(record, caller)                   → boolean
 *   canEdit(record, caller)                   → boolean
 *   validateWrite(existing, input, caller)    → string | null   (error message)
 *
 * where `caller` is `{ sub, groups, orgId }`. Steps inserted per field:
 *
 *   Query.get<Root>, list<Root>, <rootListQueries>   caller → data → filter (null / items[])
 *   Mutation.create<Root>                            caller → validateWrite(null, input) → data
 *   Mutation.update|delete<Root>                     caller → GetItem root → canEdit + validateWrite → data
 *   Query.<childByRootQueries>                       caller → GetItem root by args[fk] → canView → data
 *   Query.get<Child>                                 caller → data → GetItem root by result[fk] → canView
 *   Mutation.create<Child>                           caller → GetItem root by input[fk] → canEdit → data
 *   Mutation.update|delete<Child>                    caller → GetItem child → GetItem root → canEdit → data
 *   Query.list<Child>, <childDeniedQueries>          caller → denied for Cognito callers
 *
 * IAM callers (Lambdas) bypass, exactly like entitlements. Unauthorized
 * reads answer as "not found" so existence never leaks; unauthorized
 * writes fail with `RecordAccessDenied`. Filtered list pages may return
 * fewer items than `limit` — paginate on nextToken, not on count.
 */

export interface RecordAccessPolicy {
  /** Model carrying the access decision, e.g. "Project". */
  root: string;
  /** Foreign-key field on children pointing at the root, e.g. "projectId". */
  foreignKey: string;
  /** Child models whose rows inherit the root's access. */
  children: string[];
  /** Secondary-index query fields that return root records (`<roots>ByOrg`). */
  rootListQueries?: string[];
  /** Child model → query fields keyed by the foreign key (`<children>ByProject`). */
  childByRootQueries?: Record<string, string[]>;
  /** Child model → org-wide query fields that cannot be filtered per record; denied for Cognito callers. */
  childDeniedQueries?: Record<string, string[]>;
  /** JS source defining canView / canEdit / validateWrite (APPSYNC_JS subset — no imports/exports). */
  decisionSource: string;
}

type DataResources = {
  graphqlApi: appsync.IGraphqlApi;
  cfnResources: {
    cfnResolvers: Record<string, appsync.CfnResolver>;
    cfnDataSources: Record<string, appsync.CfnDataSource>;
  };
};

const here = dirname(fileURLToPath(import.meta.url));
const stepSource = (file: string) => readFileSync(join(here, file), 'utf8');

/** Where a step sits relative to Amplify's data resolver (always last). */
type Placement = 'before' | 'after';

export function applyRecordAccess(
  data: DataResources,
  policies: RecordAccessPolicy[]
): { gatedFields: string[] } {
  if (policies.length === 0) return { gatedFields: [] };

  const apiId = data.graphqlApi.apiId;
  const runtime = { name: 'APPSYNC_JS', runtimeVersion: '1.0.0' };

  const dataSourceByName = (name: string) => {
    const ds = Object.values(data.cfnResources.cfnDataSources).find((d) => d.name === name);
    if (!ds) throw new Error(`RecordAccess: data source "${name}" not found`);
    return ds;
  };

  const functions = new Map<string, appsync.CfnFunctionConfiguration>();
  const fn = (id: string, dataSourceName: string, file: string, replacements: Record<string, string>) => {
    const key = `RecordAccess${id}`;
    const existing = functions.get(key);
    if (existing) return existing;
    let source = stepSource(file);
    for (const [k, v] of Object.entries(replacements)) source = source.split(k).join(v);
    const ds = dataSourceByName(dataSourceName);
    // Create each step in the nested stack that owns its data source table,
    // never in the top-level data stack. Amplify Gen 2 gives every model its
    // own nested stack; a top-level function that depends on a table inside
    // one of them, while that same nested stack's resolvers reference the
    // function back, is a dependency in both directions between the same
    // two stacks — CloudFormation rejects it at deploy
    // (CloudformationResourceCircularDependencyError), and CDK does not
    // catch it at synth because the loop runs through the nested stack's
    // Parameters. Six such loops broke the first staging deploy of this
    // engine: RootWrite against the root's stack and one <Child>Load
    // against each child's. In the owning stack the dependency is
    // intra-stack, and a step referenced from a sibling model's stack
    // (ChildRootView/Edit/Get, whose data source is the root table) becomes
    // a one-way sibling reference CDK plumbs through the parent. Same fix
    // as amplify/data/run-keys/. The caller/read/create/deny steps land in
    // the foundation User model's stack for the same reason.
    const created = new appsync.CfnFunctionConfiguration(Stack.of(ds), key, {
      apiId,
      name: key,
      dataSourceName,
      runtime,
      code: source,
    });
    created.addDependency(ds);
    functions.set(key, created);
    return created;
  };

  const resolverKeys = Object.keys(data.cfnResources.cfnResolvers);
  /** Amplify pluralizes list fields; find `Query.list<Model>` / `list<Model>s` / `list<Model>es`. */
  const listField = (model: string) =>
    resolverKeys
      .filter((k) => k.startsWith(`Query.list${model}`) && /^(s|es)?$/.test(k.slice(`Query.list${model}`.length)))
      .map((k) => k.slice('Query.'.length));

  const gatedFields: string[] = [];
  const insert = (typeField: string, steps: appsync.CfnFunctionConfiguration[], placement: Placement) => {
    const resolver = data.cfnResources.cfnResolvers[typeField];
    if (!resolver) throw new Error(`RecordAccess: resolver ${typeField} not found — is the model in the schema?`);
    const pipeline = resolver.pipelineConfig as appsync.CfnResolver.PipelineConfigProperty | undefined;
    const existing = pipeline?.functions;
    if (!existing || existing.length === 0) throw new Error(`RecordAccess: ${typeField} is not a pipeline resolver`);
    const ids = steps.map((s) => s.attrFunctionId);
    const last = existing[existing.length - 1];
    resolver.pipelineConfig = {
      functions:
        placement === 'before'
          ? [...existing.slice(0, -1), ...ids, last]
          : [...existing, ...ids],
    };
    gatedFields.push(typeField.slice(typeField.indexOf('.') + 1));
  };

  for (const p of policies) {
    const rootTable = `${p.root}Table`;
    const common = { '/* __DECISION__ */': p.decisionSource, __FK__: p.foreignKey };
    const tag = p.root;

    // Caller resolution: identity + org (via User) once per request. Reads
    // run it after the data step (pass-through); writes before.
    const caller = fn(`${tag}Caller`, 'UserTable', 'caller.js', common);
    const rootRead = fn(`${tag}RootRead`, 'UserTable', 'root-read.js', common);
    const rootCreate = fn(`${tag}RootCreate`, 'UserTable', 'root-create.js', common);
    const rootWrite = fn(`${tag}RootWrite`, rootTable, 'root-write.js', common);
    const childRootView = fn(`${tag}ChildRootView`, rootTable, 'child-root.js', { ...common, __MODE__: 'view' });
    const childRootEdit = fn(`${tag}ChildRootEdit`, rootTable, 'child-root.js', { ...common, __MODE__: 'edit' });
    const childGet = fn(`${tag}ChildGet`, rootTable, 'child-get.js', common);
    const deny = fn(`${tag}Deny`, 'UserTable', 'deny.js', common);

    // Root reads
    for (const q of [`get${p.root}`, ...listField(p.root), ...(p.rootListQueries ?? [])]) {
      insert(`Query.${q}`, [caller, rootRead], 'after');
    }
    // Root writes
    insert(`Mutation.create${p.root}`, [caller, rootCreate], 'before');
    insert(`Mutation.update${p.root}`, [caller, rootWrite], 'before');
    insert(`Mutation.delete${p.root}`, [caller, rootWrite], 'before');

    for (const child of p.children) {
      const childLoad = fn(`${tag}${child}Load`, `${child}Table`, 'child-load.js', common);
      for (const q of p.childByRootQueries?.[child] ?? []) insert(`Query.${q}`, [caller, childRootView], 'before');
      insert(`Query.get${child}`, [caller, childGet], 'after');
      for (const q of [...listField(child), ...(p.childDeniedQueries?.[child] ?? [])]) {
        insert(`Query.${q}`, [caller, deny], 'before');
      }
      insert(`Mutation.create${child}`, [caller, childRootEdit], 'before');
      insert(`Mutation.update${child}`, [caller, childLoad, childRootEdit], 'before');
      insert(`Mutation.delete${child}`, [caller, childLoad, childRootEdit], 'before');
    }
  }

  return { gatedFields };
}
