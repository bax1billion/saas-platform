import type { HelperDefinition } from '../shared/assist/types';

/**
 * Assist helpers — the per-product half of the Assist service, like
 * export-providers.ts for exports. Downstream-owned: the foundation ships
 * an empty map; the product registers its helpers. Imported by the
 * assist-run function at runtime, so nothing here may import a schema file
 * or @aws-amplify/backend.
 *
 *   import { widgetSummaryHelper } from '../functions/widgets-shared/assist-summary';
 *   export const assistHelpers = { [widgetSummaryHelper.id]: widgetSummaryHelper };
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const assistHelpers: Record<string, HelperDefinition<any, any>> = {};
