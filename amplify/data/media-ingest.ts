import type { IngestResult } from '../functions/s3-file-trigger/ingest';

/**
 * Media-ingest seam — the per-product write for the s3-file-trigger
 * pipeline (amplify/functions/s3-file-trigger). Downstream-owned, like
 * media-auth.ts and vertical.ts: the foundation ships this no-op that logs
 * the verdict; a product maps `uploads/<entity>/…` to the record that owns
 * the file and writes the server-only columns (sha256, validation status,
 * EXIF) over the Lambda's IAM grant — columns no client group may write
 * (docs/core-data-model.md §2.5; docs/getting-started.md "Storage").
 *
 * Outcomes:
 *   recorded — the owning row was updated
 *   ignored  — nothing owns this key (or the metadata doesn't match it);
 *              logged, not retried
 *   retry    — the row should exist but doesn't yet (clients create it
 *              right after the upload completes); the trigger waits and
 *              retries, then defers to Lambda's async retry
 *
 * Product sketch:
 *
 *   const res = await ctx.graphql(`query ($id: ID!) { getWidgetFile(id: $id) { id s3Key } }`, { id: ctx.mediaId });
 *   if (!res.getWidgetFile) return 'retry';
 *   if (res.getWidgetFile.s3Key !== ctx.key) return 'ignored';   // metadata must own the key
 *   await ctx.graphql(`mutation ($input: UpdateWidgetFileInput!) { updateWidgetFile(input: $input) { id } }`,
 *     { input: ctx.result.status === 'VALID'
 *         ? { id: ctx.mediaId, sha256: ctx.result.sha256, fileValidationStatus: 'VALID', ... }
 *         : { id: ctx.mediaId, fileValidationStatus: 'INVALID', fileValidationMessage: ctx.result.message } });
 *   return 'recorded';
 */

export interface MediaIngestContext {
  bucket: string;
  key: string;
  /** Second key segment — the vertical decides what it means (a case id, an org id…). */
  entityId: string;
  /** `x-amz-meta-media-id` set by the uploader: the owning row's id, if the vertical sends one. */
  mediaId?: string;
  result: IngestResult;
  graphql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
}

export type MediaIngestOutcome = 'recorded' | 'ignored' | 'retry';

export async function recordMediaIngest(ctx: MediaIngestContext): Promise<MediaIngestOutcome> {
  console.log('MediaIngest: no vertical seam configured — verdict not persisted', {
    key: ctx.key,
    entityId: ctx.entityId,
    mediaId: ctx.mediaId ?? null,
    status: ctx.result.status,
    ...(ctx.result.status === 'VALID' ? { sha256: ctx.result.sha256 } : { message: ctx.result.message }),
  });
  return 'ignored';
}
