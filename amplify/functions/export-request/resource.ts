import { defineFunction } from '@aws-amplify/backend';

/**
 * The export service's front door (docs/spine-services-design.md § 3):
 * `requestExport` asks the record's provider for the document, refuses
 * before anything is written when the caller may not export it or a
 * suggested value is unconfirmed, and queues an ExportJob row; the
 * export-renderer (amplify/custom/export-renderer) picks the row up from
 * the table's stream. `getExportDownload` hands back a short-lived
 * download link for a finished job after an org check.
 *
 * EXPORTS_BUCKET and the S3 grants are added in amplify/backend.ts.
 */
export const exportRequestFunction = defineFunction({
  name: 'export-request',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30,
  memoryMB: 512,
  resourceGroupName: 'data',
});
