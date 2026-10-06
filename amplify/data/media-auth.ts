/**
 * Media-access authorization seam — the per-product decision for
 * getMediaAccess (amplify/functions/get-media-urls). Downstream-owned,
 * like vertical.ts: the foundation ships deny-all; the product maps its
 * media prefixes to ownership checks (e.g. parse an entity id from the
 * prefix, fetch it via ctx.graphql, and compare orgId).
 *
 * Called with the caller's resolved org, groups and a validated prefix
 * (ends with "/", no "..", "*", or leading "/"). Return true only when the
 * caller may view everything under the prefix. A product that polices
 * records server-side (docs/record-access.md) applies the same decision
 * here, so a record's thumbnails are exactly as private as its rows.
 */

export interface MediaAuthContext {
  cognitoSub: string;
  /** Cognito groups from the id token (Admin / Member / Viewer / Operator). */
  groups: readonly string[];
  orgId: string;
  prefix: string;
  graphql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
}

export async function authorizeMediaPrefix(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: MediaAuthContext
): Promise<boolean> {
  return false;
}
