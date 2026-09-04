import type { Schema } from '../../data/resource';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { graphql } from '../../shared/graphql';
import { authorizeMediaPrefix } from '../../data/media-auth';

/**
 * getMediaAccess(prefix) — CloudFront signed access to the media CDN
 * (docs/image-delivery.md §4, P2).
 *
 * Grants one wildcard custom policy per prefix (e.g. one per case), so a
 * whole photo log needs a single small response: the client appends the
 * returned auth params plus transform params (?w=&q=&f=auto) to
 * https://<domain>/<s3Key> itself. The wildcard policy signs the POLICY,
 * not an exact URL, so the viewer-request rewrite and any transform params
 * stay valid.
 *
 * Authorization: caller must belong to an org, and the vertical's
 * authorizeMediaPrefix (amplify/data/media-auth.ts) must approve the
 * org/prefix pair. When the CDN isn't in signed mode (no key pair or a
 * placeholder secret), returns { enabled: false } and clients fall back
 * to direct signed S3 URLs.
 */

const DOMAIN = process.env.MEDIA_CDN_DOMAIN ?? '';
const KEY_PAIR_ID = process.env.MEDIA_CDN_KEY_PAIR_ID ?? '';
const PRIVATE_KEY = process.env.MEDIA_CDN_PRIVATE_KEY ?? '';
const TTL_SECONDS = 15 * 60;

const signingEnabled = () =>
  DOMAIN.length > 0 &&
  KEY_PAIR_ID.length > 0 &&
  PRIVATE_KEY.includes('BEGIN') &&
  PRIVATE_KEY.includes('PRIVATE KEY');

/** Pure signing core (exported for tests). */
export function signPrefixAccess(
  prefix: string,
  cfg: { domain: string; keyPairId: string; privateKey: string; ttlSeconds: number }
): { domain: string; params: string; expiresAt: string } {
  const expires = Math.floor(Date.now() / 1000) + cfg.ttlSeconds;
  const resource = `https://${cfg.domain}/${prefix}*`;
  const policy = JSON.stringify({
    Statement: [
      {
        Resource: resource,
        Condition: { DateLessThan: { 'AWS:EpochTime': expires } },
      },
    ],
  });
  const signed = getSignedUrl({
    url: `https://${cfg.domain}/${prefix}`,
    keyPairId: cfg.keyPairId,
    privateKey: cfg.privateKey,
    policy,
  });
  const params = signed.split('?')[1] ?? '';
  if (!params.includes('Signature=')) {
    throw new Error('Media URL signing produced no signature');
  }
  return {
    domain: cfg.domain,
    params,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}

export const handler: Schema['getMediaAccess']['functionHandler'] = async (
  event
) => {
  const prefix = event.arguments.prefix;
  // Shape check before anything else: relative-path tricks never sign.
  if (
    !prefix ||
    !prefix.endsWith('/') ||
    prefix.includes('..') ||
    prefix.includes('*') ||
    prefix.includes('?') ||
    prefix.startsWith('/')
  ) {
    throw new Error('Invalid media prefix');
  }

  if (!signingEnabled()) {
    return { enabled: false, domain: null, params: null, expiresAt: null };
  }

  const identity = event.identity as { sub?: string } | null | undefined;
  const cognitoSub = identity?.sub;
  if (!cognitoSub) {
    throw new Error('getMediaAccess requires a signed-in user.');
  }

  const userRes = await graphql<{
    usersByCognitoSub: { items: Array<{ id: string; orgId: string | null }> };
  }>(
    `query BySub($sub: String!) {
      usersByCognitoSub(cognitoSub: $sub, limit: 1) { items { id orgId } }
    }`,
    { sub: cognitoSub }
  );
  const orgId = userRes.usersByCognitoSub.items[0]?.orgId;
  if (!orgId) {
    throw new Error('Complete onboarding before requesting media access.');
  }

  const allowed = await authorizeMediaPrefix({ cognitoSub, orgId, prefix, graphql });
  if (!allowed) {
    throw new Error('Not authorized for this media prefix.');
  }

  const access = signPrefixAccess(prefix, {
    domain: DOMAIN,
    keyPairId: KEY_PAIR_ID,
    privateKey: PRIVATE_KEY,
    ttlSeconds: TTL_SECONDS,
  });
  return { enabled: true, ...access };
};
