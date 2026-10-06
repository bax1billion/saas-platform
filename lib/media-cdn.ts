"use client";

import { getDataClient } from "@/lib/data-client";

/**
 * Client access to the private media CDN (docs/image-delivery.md).
 *
 * One getMediaAccess(prefix) grant covers everything under the prefix
 * (wildcard custom policy), so a whole photo log costs one small query.
 * Grants are cached until shortly before expiry. When the CDN is not in
 * signed mode the query answers { enabled: false } and callers should
 * fall back to direct signed S3 URLs.
 */

export interface MediaAccess {
  enabled: boolean;
  domain?: string | null;
  params?: string | null;
  expiresAt?: string | null;
}

export interface VariantOpts {
  /** Max width in px (1–4096). */
  w?: number;
  /** Max height in px (1–4096). */
  h?: number;
  /** Quality 1–100. */
  q?: number;
  /** "auto" picks AVIF/WebP from the browser's Accept header. */
  f?: "auto" | "jpeg" | "webp" | "avif" | "png";
}

const REFRESH_MARGIN_MS = 2 * 60 * 1000;
const cache = new Map<string, { access: MediaAccess; expires: number }>();

/** Signed access for one prefix (e.g. `uploads/<caseId>/`), cached. */
export async function getMediaAccess(prefix: string): Promise<MediaAccess> {
  const cached = cache.get(prefix);
  if (cached && cached.expires - REFRESH_MARGIN_MS > Date.now()) {
    return cached.access;
  }
  const { data, errors } = await getDataClient().queries.getMediaAccess({
    prefix,
  });
  if (errors?.length || !data) {
    throw new Error(errors?.[0]?.message ?? "Media access request failed");
  }
  const access: MediaAccess = data;
  const expires = access.expiresAt
    ? new Date(access.expiresAt).getTime()
    : Date.now() + REFRESH_MARGIN_MS + 60_000;
  cache.set(prefix, { access, expires });
  return access;
}

function withQuery(url: string, parts: string[]): string {
  const q = parts.filter(Boolean).join("&");
  return q ? `${url}?${q}` : url;
}

const encodePath = (key: string) => key.split("/").map(encodeURIComponent).join("/");

/** Build a variant URL under an access grant. Key must start with the
 *  grant's prefix. `params` is empty in open mode (sandbox). */
export function buildVariantUrl(
  access: MediaAccess,
  key: string,
  opts: VariantOpts = {}
): string | null {
  if (!access.enabled || !access.domain || access.params == null) return null;
  const variant = Object.entries(opts)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return withQuery(`https://${access.domain}/${encodePath(key)}`, [access.params, variant]);
}

/**
 * URL of the untouched original, served by CloudFront straight from S3
 * with range support (video/audio playback, downloads). The CDN's
 * originals behavior (path pattern star-slash-original-slash-star) strips
 * the marker segment inserted after the entity id:
 * `uploads/<entity>/<file>` → `/uploads/<entity>/original/<file>`.
 * S3 itself is never read by clients (docs/image-delivery.md §4).
 */
export function buildOriginalUrl(access: MediaAccess, key: string): string | null {
  if (!access.enabled || !access.domain || access.params == null) return null;
  const segments = key.split("/");
  if (segments.length < 3) return null;
  const path = [...segments.slice(0, 2), "original", ...segments.slice(2)].map(encodeURIComponent).join("/");
  return withQuery(`https://${access.domain}/${path}`, [access.params]);
}
