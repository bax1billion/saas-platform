import type { ExportProvider } from '../shared/export/types';

/**
 * Export providers — the per-product half of the export service, like
 * vertical.ts for the schema and media-auth.ts for media. Downstream-owned:
 * the foundation ships an empty map; the product registers one provider
 * per record type. Imported by the export-request function at runtime, so
 * nothing here may import a schema file or @aws-amplify/backend.
 *
 *   import { widgetExportProvider } from '../functions/widgets-shared/export';
 *   export const exportProviders = { [widgetExportProvider.recordType]: widgetExportProvider };
 */
export const exportProviders: Record<string, ExportProvider> = {};
