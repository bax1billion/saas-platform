/**
 * Media-access authorization seam — the per-product decision for
 * getMediaAccess (amplify/functions/get-media-urls). Downstream-owned,
 * like vertical.ts: the foundation default denies everything; a product
 * maps its media prefixes to ownership checks (e.g. parse an entity id
 * from the prefix, fetch it via ctx.graphql, and compare orgId).
 */

export interface MediaAuthContext {
  cognitoSub: string;
  orgId: string;
  prefix: string;
  graphql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
}

export async function authorizeMediaPrefix(
  _ctx: MediaAuthContext
): Promise<boolean> {
  return false;
}
