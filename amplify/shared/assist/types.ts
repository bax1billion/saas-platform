/**
 * The Assist helper seam (docs/spine-services-design.md § 2, pattern A).
 * A product registers helpers in amplify/data/assist-helpers.ts; the
 * assist-run function runs them. A helper owns what the foundation cannot
 * know: whether this caller may run it on this record, which fields it may
 * read (the allow list is the `load` step, nothing else reaches the model),
 * the prompt, the output shape, and what a good answer looks like.
 *
 * Every helper: drafts, flags, explains or prepares; never writes a
 * record. Its output lands as a suggestion the person confirms through the
 * product's own write path; the decision is logged on the AssistEvent.
 */

export type ModelClass = 'fast' | 'draft';

export interface AssistCaller {
  sub: string;
  orgId: string;
  groups: readonly string[];
}

export interface AssistRunContext {
  caller: AssistCaller;
  recordId: string;
  /** A finer target inside the record, e.g. one media item of a case. */
  targetId?: string | null;
  graphql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
  /** Read one stored object (allow-listed by the helper), e.g. an image. */
  readObject: (key: string) => Promise<{ bytes: Uint8Array; contentType: string } | null>;
}

export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp';

export interface PromptImage {
  format: ImageFormat;
  bytes: Uint8Array;
}

export interface Prompt {
  system: string;
  /** The user turn: text, with optional images before it. */
  text: string;
  images?: PromptImage[];
  maxTokens?: number;
}

/** A JSON schema the model must answer with (tool use); kept small and flat. */
export interface OutputSchema {
  name: string;
  description: string;
  json: Record<string, unknown>;
}

export type LoadResult<I> = { ok: true; input: I } | { ok: false; reason: string };

export interface HelperDefinition<I = unknown, O = unknown> {
  /** `<product>.<job>`, e.g. "origin.caption". Stable; logged on every event. */
  id: string;
  /** Module id that owns it (for the switch and the log). */
  product: string;
  /** The record type `assistRun` is called with. */
  recordType: string;
  /** Bumped whenever the prompt or the schema changes; logged on every event. */
  promptVersion: string;
  model: ModelClass;
  /** Shipped switch default; the agency can flip it in Organization.settings.assist. */
  defaultOn: boolean;
  /** Groups that may run it. */
  allowGroups: readonly string[];
  /** One line for the Admin screen: what it does and never does. */
  summary: string;
  /** Access check plus the allow list: load exactly the fields the prompt may see. */
  load(ctx: AssistRunContext): Promise<LoadResult<I>>;
  /** Rules first: an answer without a model call, or null to ask the model. */
  rules?(input: I): O | null;
  prompt(input: I): Prompt;
  schema: OutputSchema;
  /** Turn the model's JSON into the helper's output, or refuse with a reason. */
  parse(raw: unknown, input: I): { ok: true; output: O } | { ok: false; reason: string };
}
