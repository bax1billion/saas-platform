import { createHash } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Schema } from '../../data/resource';
import { graphql } from '../../shared/graphql';
import { assistHelpers } from '../../data/assist-helpers';
import { invokeStructured } from '../../shared/assist/bedrock';
import { decideAssist, parseAssistSettings, usageId, type AssistMode } from '../../shared/assist/settings';
import type { AssistCaller, HelperDefinition } from '../../shared/assist/types';

/**
 * assistRun(helperId, recordType, recordId, targetId?)
 *   1. Resolve the caller (sub, org, groups) and the helper.
 *   2. Switches: environment mode, the agency's kill switch, the helper's
 *      switch; the monthly cap decides rules-only versus the model.
 *   3. The helper loads its allow-listed input (its own access check).
 *   4. Rules first; a cached event with the same input hash, prompt
 *      version and model answers without a call; otherwise Bedrock with
 *      the helper's schema.
 *   5. Write an AssistEvent (PROPOSED) and bump the month's usage; return
 *      the suggestion. The screen shows it light; nothing is written to
 *      the record here.
 *
 * assistDecide(eventId, state, finalOutput?)
 *   The person's decision on a PROPOSED event: ACCEPTED, EDITED (with what
 *   they kept) or REJECTED. The record itself is written by the product's
 *   normal path; this is the log.
 *
 * Every row loaded is compared with the caller's org (a Lambda bypasses
 * the model rules). Nothing here names a model vendor to the client.
 */

const MODE = (process.env.ASSIST_MODE ?? 'off') as AssistMode;
const MODELS = { fast: process.env.ASSIST_MODEL_FAST ?? '', draft: process.env.ASSIST_MODEL_DRAFT ?? '' };
const DEFAULT_CAP = Number(process.env.ASSIST_MONTHLY_RUN_CAP ?? '500');
const GUARDRAIL = process.env.ASSIST_GUARDRAIL_ID ? { id: process.env.ASSIST_GUARDRAIL_ID, version: process.env.ASSIST_GUARDRAIL_VERSION ?? 'DRAFT' } : undefined;
const BUCKET = process.env.MEDIA_BUCKET ?? '';
const MAX_OBJECT_BYTES = 4_500_000;

type Identity = { sub?: string; groups?: string[] | null } | null | undefined;

async function resolveCaller(identity: Identity): Promise<AssistCaller> {
  const sub = identity?.sub;
  if (!sub) throw new Error('Sign in to use Assist.');
  const res = await graphql<{ usersByCognitoSub: { items: Array<{ orgId: string | null }> } }>(
    `query BySub($sub: String!) { usersByCognitoSub(cognitoSub: $sub, limit: 1) { items { orgId } } }`,
    { sub }
  );
  const orgId = res.usersByCognitoSub.items[0]?.orgId;
  if (!orgId) throw new Error('Complete onboarding before using Assist.');
  return { sub, orgId, groups: identity?.groups ?? [] };
}

const s3 = new S3Client({});
async function readObject(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!BUCKET || !key.startsWith('uploads/')) return null;
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if ((obj.ContentLength ?? 0) > MAX_OBJECT_BYTES) return null;
  const bytes = await obj.Body!.transformToByteArray();
  return { bytes, contentType: obj.ContentType ?? 'application/octet-stream' };
}

const hashInput = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

type RunArgs = Schema['assistRun']['args'];
type DecideArgs = Schema['assistDecide']['args'];

export async function assistRun(args: RunArgs, identity: Identity) {
  const caller = await resolveCaller(identity);
  const helper = assistHelpers[args.helperId] as HelperDefinition | undefined;
  if (!helper || helper.recordType !== args.recordType) throw new Error('That Assist helper does not exist.');
  if (!helper.allowGroups.some((g) => caller.groups.includes(g))) throw new Error('Your role cannot run this helper.');

  const now = new Date();
  const [orgRes, usageRes] = await Promise.all([
    graphql<{ getOrganization: { settings: unknown } | null }>(`query O($id: ID!) { getOrganization(id: $id) { settings } }`, { id: caller.orgId }),
    graphql<{ getAssistUsage: { id: string; runs: number; tokensIn: number; tokensOut: number } | null }>(
      `query U($id: ID!) { getAssistUsage(id: $id) { id runs tokensIn tokensOut } }`,
      { id: usageId(caller.orgId, now) }
    ),
  ]);
  const usage = usageRes.getAssistUsage;
  const decision = decideAssist({
    mode: MODE,
    settings: parseAssistSettings(orgRes.getOrganization?.settings),
    helperId: helper.id,
    helperDefaultOn: helper.defaultOn,
    runsThisMonth: usage?.runs ?? 0,
    defaultCap: DEFAULT_CAP,
  });
  if (!decision.allowed) throw new Error(decision.reason);

  const loaded = await helper.load({ caller, recordId: args.recordId, targetId: args.targetId ?? null, graphql, readObject });
  if (!loaded.ok) throw new Error(loaded.reason);
  const inputHash = hashInput(loaded.input);

  let output: unknown;
  let modelId = 'rules';
  let tokensIn = 0;
  let tokensOut = 0;
  let cached = false;

  const ruled = helper.rules?.(loaded.input) ?? null;
  if (ruled !== null) {
    output = ruled;
  } else {
    const wanted = MODELS[helper.model];
    // Cache by record and version: the same input through the same prompt
    // and model is the same answer, so a repeat costs nothing.
    const prior = await graphql<{ assistEventsByRecord: { items: Array<{ output: unknown; modelId: string; promptVersion: string; inputHash: string; helperId: string }> } }>(
      `query P($recordId: ID!) { assistEventsByRecord(recordId: $recordId, sortDirection: DESC, limit: 50) { items { output modelId promptVersion inputHash helperId } } }`,
      { recordId: args.recordId }
    );
    const hit = prior.assistEventsByRecord.items.find(
      (e) => e.helperId === helper.id && e.inputHash === inputHash && e.promptVersion === helper.promptVersion && e.modelId === wanted
    );
    if (hit) {
      output = typeof hit.output === 'string' ? JSON.parse(hit.output) : hit.output;
      modelId = hit.modelId;
      cached = true;
    } else {
      if (!decision.model) throw new Error(decision.reason ?? 'Assist cannot call the model right now.');
      if (!wanted) throw new Error('No model is configured for this environment.');
      const res = await invokeStructured(helper.prompt(loaded.input), helper.schema, { modelId: wanted, guardrail: GUARDRAIL });
      const parsed = helper.parse(res.output, loaded.input);
      if (!parsed.ok) throw new Error(parsed.reason);
      output = parsed.output;
      modelId = res.modelId;
      tokensIn = res.tokensIn;
      tokensOut = res.tokensOut;
    }
  }

  const iso = now.toISOString();
  const created = await graphql<{ createAssistEvent: { id: string } }>(
    `mutation E($input: CreateAssistEventInput!) { createAssistEvent(input: $input) { id } }`,
    {
      input: {
        orgId: caller.orgId,
        helperId: helper.id,
        product: helper.product,
        promptVersion: helper.promptVersion,
        modelId,
        recordType: args.recordType,
        recordId: args.recordId,
        targetId: args.targetId ?? null,
        inputHash,
        output: JSON.stringify(output),
        tokensIn,
        tokensOut,
        cached,
        state: 'PROPOSED',
        requestedBy: caller.sub,
        sortDate: iso,
      },
    }
  );
  if (!cached && modelId !== 'rules') {
    const id = usageId(caller.orgId, now);
    if (usage) {
      await graphql(`mutation U($input: UpdateAssistUsageInput!) { updateAssistUsage(input: $input) { id } }`, {
        input: { id, runs: usage.runs + 1, tokensIn: usage.tokensIn + tokensIn, tokensOut: usage.tokensOut + tokensOut },
      });
    } else {
      await graphql(`mutation C($input: CreateAssistUsageInput!) { createAssistUsage(input: $input) { id } }`, {
        input: { id, orgId: caller.orgId, month: iso.slice(0, 7), runs: 1, tokensIn, tokensOut },
      });
    }
  }

  return { eventId: created.createAssistEvent.id, helperId: helper.id, promptVersion: helper.promptVersion, output: JSON.stringify(output), cached, tokensIn, tokensOut };
}

export async function assistDecide(args: DecideArgs, identity: Identity) {
  const caller = await resolveCaller(identity);
  const res = await graphql<{ getAssistEvent: { id: string; orgId: string; state: string } | null }>(
    `query G($id: ID!) { getAssistEvent(id: $id) { id orgId state } }`,
    { id: args.eventId }
  );
  const ev = res.getAssistEvent;
  if (!ev || ev.orgId !== caller.orgId) throw new Error('That suggestion is not available.');
  if (ev.state !== 'PROPOSED') throw new Error('That suggestion was already decided.');
  const updated = await graphql<{ updateAssistEvent: { id: string; state: string } }>(
    `mutation D($input: UpdateAssistEventInput!) { updateAssistEvent(input: $input) { id state } }`,
    { input: { id: ev.id, state: args.state, finalOutput: args.finalOutput ?? null, decidedBy: caller.sub, decidedAt: new Date().toISOString() } }
  );
  return { eventId: updated.updateAssistEvent.id, state: updated.updateAssistEvent.state };
}

type AnyEvent = { info: { fieldName: string }; arguments: Record<string, unknown>; identity: Identity };

export const handler = async (event: AnyEvent) => {
  switch (event.info.fieldName) {
    case 'assistRun':
      return assistRun(event.arguments as RunArgs, event.identity);
    case 'assistDecide':
      return assistDecide(event.arguments as DecideArgs, event.identity);
    default:
      throw new Error(`Unknown field ${event.info.fieldName}`);
  }
};
