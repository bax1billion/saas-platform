import type { DocumentModel } from '../../../lib/export/model';

/**
 * The export provider seam (docs/spine-services-design.md § 3). A product
 * registers one provider per record type in amplify/data/export-providers.ts;
 * the export-request function calls it with the resolved caller and
 * returns the document it builds, or the reason it refused.
 *
 * A provider owns three things the foundation cannot know: whether this
 * caller may export this record (the product's own access rule), whether
 * the record is ready (nothing suggested, nothing missing that the agency
 * requires), and what the document says. It never writes.
 */

export interface ExportRequestContext {
  orgId: string;
  callerSub: string;
  /** Cognito groups from the id token. */
  groups: readonly string[];
  recordId: string;
  template?: string | null;
  /** ISO datetime the request arrived; the document's data date. */
  requestedAt: string;
  graphql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
}

export type ExportBuildResult =
  | { ok: true; document: DocumentModel }
  | { ok: false; reason: string };

export interface ExportProvider {
  /** The record type the client names in `requestExport`, e.g. "case". */
  recordType: string;
  build(ctx: ExportRequestContext): Promise<ExportBuildResult>;
}
