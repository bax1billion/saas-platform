import type { ExportProvider, ExportRequestContext } from './types';
import { EXPORT_EXTENSION, exportFileName, validateDocument, type ExportFormatId } from '../../../lib/export/model';

/**
 * Queue one export job: ask the provider for the document, refuse if it
 * is not exportable, and write the QUEUED row the renderer picks up from
 * the table's stream (docs/spine-services-design.md § 3). Shared by the
 * export-request function (a person asking from a screen) and by product
 * commands that export as part of their own transition (a payroll period
 * being locked), so there is one way a job is born and one record of it.
 *
 * The caller has already decided who may ask; this only decides whether
 * the document may leave. It writes exactly one row.
 */

/** Every column of the row, `document` included: a command returns this row
 *  as its ExportJob, and a client that selects every field (the generated
 *  client does) fails on a missing non-null column ("Cannot return null for
 *  non-nullable type: 'AWSJSON' within parent 'ExportJob'"). The document
 *  is the model's JSON, never file bytes, so it is small. */
export const EXPORT_JOB_FIELDS = `id orgId recordType recordId template format status fileName document dataDate requestedBy
  s3Key sha256 sizeBytes pageCount rendererVersion error isDeleted sortDate createdAt updatedAt`;

export interface ExportJobRow {
  id: string;
  orgId: string;
  recordType: string;
  recordId: string;
  template: string | null;
  /** The document model as AWSJSON. */
  document: string;
  format: ExportFormatId;
  status: string;
  fileName: string;
  dataDate: string;
  requestedBy: string | null;
  s3Key: string | null;
  sha256: string | null;
  sizeBytes: number | null;
  pageCount: number | null;
  rendererVersion: string | null;
  error: string | null;
  isDeleted: boolean | null;
  sortDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueueExportArgs {
  provider: ExportProvider;
  format: ExportFormatId;
  template?: string | null;
  recordId: string;
  caller: { orgId: string; sub: string; groups: readonly string[] };
  /** Defaults to now; the document's data date. */
  requestedAt?: string;
  graphql: ExportRequestContext['graphql'];
}

export async function queueExportJob(args: QueueExportArgs): Promise<{ job: ExportJobRow; rowCount: number }> {
  const requestedAt = args.requestedAt ?? new Date().toISOString();
  const built = await args.provider.build({
    orgId: args.caller.orgId,
    callerSub: args.caller.sub,
    groups: args.caller.groups,
    recordId: args.recordId,
    template: args.template ?? null,
    requestedAt,
    graphql: args.graphql,
  });
  if (!built.ok) throw new Error(built.reason);

  const problems = validateDocument(built.document);
  if (problems.length) throw new Error(problems[0]);

  const fileName = exportFileName(built.document, EXPORT_EXTENSION[args.format]);
  const res = await args.graphql<{ createExportJob: ExportJobRow }>(
    `mutation Q($input: CreateExportJobInput!) { createExportJob(input: $input) { ${EXPORT_JOB_FIELDS} } }`,
    {
      input: {
        orgId: args.caller.orgId,
        recordType: args.provider.recordType,
        recordId: args.recordId,
        template: built.document.meta.templateVersion,
        format: args.format,
        status: 'QUEUED',
        fileName,
        document: JSON.stringify(built.document),
        dataDate: built.document.meta.dataDate,
        requestedBy: args.caller.sub,
        sortDate: requestedAt,
      },
    }
  );
  const rowCount = built.document.sections
    .flatMap((s) => s.blocks)
    .reduce((n, b) => n + (b.kind === 'table' ? b.rows.length : 0), 0);
  return { job: res.createExportJob, rowCount };
}
