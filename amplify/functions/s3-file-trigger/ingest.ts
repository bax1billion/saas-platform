/**
 * Upload ingest rules — the pure half of the s3-file-trigger pipeline
 * (docs/video-delivery.md §4, docs/getting-started.md "Storage"). Key
 * parsing, the content-type / size allowlist, and the result shape the
 * vertical seam (amplify/data/media-ingest.ts) receives. No AWS SDK here
 * so it unit-tests in isolation.
 */

export type MediaClass = 'image' | 'video' | 'audio' | 'document';

interface ClassPolicy {
  maxBytes: number;
  /** Exact content types accepted for the class. */
  types: readonly string[];
  /** Lower-case extensions used when the browser sent no useful type. */
  extensions: readonly string[];
}

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

/**
 * What the uploads/ prefix accepts. Evidence-grade media from phones,
 * drones and body-worn cameras plus PDFs for sketches and imported
 * reports. Anything else is recorded INVALID (the object stays; the
 * record says why) so the uploader sees the problem instead of a silently
 * missing thumbnail.
 */
export const UPLOAD_POLICY: Record<MediaClass, ClassPolicy> = {
  image: {
    maxBytes: 200 * MiB,
    types: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/tiff', 'image/gif', 'image/avif'],
    extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tif', 'tiff', 'gif', 'avif', 'dng'],
  },
  video: {
    maxBytes: 8 * GiB,
    types: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska', 'video/3gpp', 'video/mpeg'],
    extensions: ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', '3gp', 'mpg', 'mpeg', 'mts'],
  },
  audio: {
    maxBytes: 2 * GiB,
    types: ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/flac'],
    extensions: ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'flac', 'webm'],
  },
  document: {
    maxBytes: 100 * MiB,
    types: ['application/pdf'],
    extensions: ['pdf'],
  },
};

/** Types browsers send when they don't know better; fall back to the extension. */
const OPAQUE_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

export interface ParsedUploadKey {
  /** Always "uploads". */
  prefix: string;
  /** Second path segment — the vertical decides what it means (a case id, an org id…). */
  entityId: string;
  /** Everything after the entity segment (may contain slashes). */
  fileName: string;
}

/** `uploads/<entityId>/<fileName…>` → parts, or null for anything else. */
export function parseUploadKey(key: string): ParsedUploadKey | null {
  const segments = key.split('/');
  if (segments.length < 3 || segments[0] !== 'uploads' || !segments[1] || !segments[2]) return null;
  return { prefix: segments[0], entityId: segments[1], fileName: segments.slice(2).join('/') };
}

export function extensionOf(fileName: string): string {
  const base = fileName.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * Class + normalized content type for an upload, from the stored type
 * first and the extension when the type is opaque. Returns null when
 * neither is on the allowlist.
 */
export function classifyUpload(
  contentType: string | undefined,
  fileName: string
): { cls: MediaClass; contentType: string } | null {
  const ct = (contentType ?? '').toLowerCase().split(';')[0].trim();
  for (const [cls, policy] of Object.entries(UPLOAD_POLICY) as [MediaClass, ClassPolicy][]) {
    if (ct && policy.types.includes(ct)) return { cls, contentType: ct };
  }
  if (OPAQUE_TYPES.has(ct)) {
    const ext = extensionOf(fileName);
    for (const [cls, policy] of Object.entries(UPLOAD_POLICY) as [MediaClass, ClassPolicy][]) {
      const i = policy.extensions.indexOf(ext);
      if (i >= 0) return { cls, contentType: policy.types[Math.min(i, policy.types.length - 1)] };
    }
  }
  return null;
}

export type ValidationDecision =
  | { ok: true; cls: MediaClass; contentType: string }
  | { ok: false; message: string };

export function validateUpload(input: {
  contentType?: string;
  fileName: string;
  sizeBytes: number;
}): ValidationDecision {
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, message: 'Empty file' };
  }
  const c = classifyUpload(input.contentType, input.fileName);
  if (!c) {
    return {
      ok: false,
      message: `Unsupported file type${input.contentType ? ` (${input.contentType})` : ''}: ${extensionOf(input.fileName) || 'no extension'}`,
    };
  }
  const max = UPLOAD_POLICY[c.cls].maxBytes;
  if (input.sizeBytes > max) {
    return { ok: false, message: `${c.cls} exceeds ${Math.round(max / MiB)} MB limit` };
  }
  return { ok: true, cls: c.cls, contentType: c.contentType };
}

/** EXIF summary the trigger extracts from images (all optional). */
export interface ExifSummary {
  capturedAt?: string;
  width?: number;
  height?: number;
  gpsLat?: number;
  gpsLng?: number;
  cameraMake?: string;
  cameraModel?: string;
}

/** What the vertical seam receives for one object. */
export type IngestResult =
  | ({
      status: 'VALID';
      cls: MediaClass;
      contentType: string;
      sizeBytes: number;
      sha256: string;
      hashedAt: string;
    } & ExifSummary)
  | { status: 'INVALID'; message: string; contentType?: string; sizeBytes: number };

/** How many leading bytes to keep aside for EXIF parsing while hashing. */
export const EXIF_HEAD_BYTES = 2 * MiB;

/** "a1b2…c3d4" for logs and UI chips. */
export function shortHash(sha256: string): string {
  return sha256.length > 12 ? `${sha256.slice(0, 8)}…${sha256.slice(-4)}` : sha256;
}
