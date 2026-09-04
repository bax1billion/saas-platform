import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';

/**
 * Media CDN transform origin (docs/image-delivery.md §5; pattern:
 * aws-samples/image-optimization).
 *
 * Invoked by CloudFront via an OAC-signed Function URL only when the
 * transformed bucket misses. The viewer-request CloudFront Function has
 * already validated and normalized the variant, so the path here is:
 *
 *   /<original S3 key>/<variant>
 *   variant = "original" | comma-joined sorted ops, e.g. "f=webp,q=75,w=192"
 *
 * The result is written back to the transformed bucket under the SAME key
 * as the request path, so the next cold hit is served by the S3 origin.
 * Responses that exceed the Function URL payload limit are stored, then
 * answered with a 302 to the same URL (now satisfiable from S3).
 *
 * Derivatives are ephemeral display artifacts — originals are never
 * touched (they live in a different bucket this function only reads).
 */

const s3 = new S3Client({});
const ORIGINALS_BUCKET = process.env.ORIGINALS_BUCKET!;
const TRANSFORMED_BUCKET = process.env.TRANSFORMED_BUCKET!;
const MAX_ORIGINAL_BYTES = Number(process.env.MAX_ORIGINAL_BYTES ?? 30 * 1024 * 1024);
/** Function URLs cap buffered responses (~6 MB); stay safely under it. */
const MAX_INLINE_RESPONSE = 5 * 1024 * 1024;
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

type Ops = { w?: number; h?: number; q?: number; f?: string };

const FORMAT_CONTENT_TYPE: Record<string, string> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  png: 'image/png',
};

/** Exported for unit tests. */
export function parseVariant(segment: string): Ops | null {
  if (segment === 'original') return {};
  const ops: Ops = {};
  for (const part of segment.split(',')) {
    const [k, v] = part.split('=');
    if (k === 'w' || k === 'h' || k === 'q') {
      const n = Number(v);
      const max = k === 'q' ? 100 : 4096;
      if (!Number.isInteger(n) || n < 1 || n > max) return null;
      ops[k] = n;
    } else if (k === 'f') {
      if (!(v in FORMAT_CONTENT_TYPE)) return null;
      ops.f = v;
    } else {
      return null;
    }
  }
  return ops;
}

const respond = (
  statusCode: number,
  body: string
): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { 'content-type': 'text/plain' },
  body,
});

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const path = decodeURIComponent(event.rawPath).replace(/^\/+/, '');
  const slash = path.lastIndexOf('/');
  if (slash <= 0) return respond(400, 'Malformed media path');

  const originalKey = path.slice(0, slash);
  const ops = parseVariant(path.slice(slash + 1));
  if (!ops) return respond(400, 'Malformed variant');

  // 1. Fetch the original
  let originalBody: Uint8Array;
  let originalContentType: string | undefined;
  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: ORIGINALS_BUCKET, Key: originalKey })
    );
    if ((obj.ContentLength ?? 0) > MAX_ORIGINAL_BYTES) {
      return respond(413, 'Original exceeds the transformable size limit');
    }
    originalBody = await obj.Body!.transformToByteArray();
    originalContentType = obj.ContentType ?? undefined;
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NoSuchKey' || name === 'NotFound' || name === 'AccessDenied') {
      return respond(404, 'Original not found');
    }
    throw err;
  }

  // 2. Transform (or pass through)
  let outBody: Buffer;
  let contentType: string;
  const wantsTransform = ops.w || ops.h || ops.f;
  if (!wantsTransform) {
    outBody = Buffer.from(originalBody);
    contentType = originalContentType ?? 'application/octet-stream';
  } else {
    try {
      let img = sharp(originalBody, { failOn: 'none', animated: false }).rotate();
      if (ops.w || ops.h) {
        img = img.resize({
          width: ops.w,
          height: ops.h,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
      const format = ops.f ?? 'jpeg';
      const quality = ops.q ?? 75;
      if (format === 'jpeg') img = img.jpeg({ quality, mozjpeg: true });
      else if (format === 'webp') img = img.webp({ quality });
      // avif encode cost grows steeply with quality; clamp it
      else if (format === 'avif') img = img.avif({ quality: Math.min(quality, 60) });
      else img = img.png();
      outBody = await img.toBuffer();
      contentType = FORMAT_CONTENT_TYPE[format];
    } catch (err) {
      console.error('MediaCdn: transform failed, passing original through', {
        key: originalKey,
        message: err instanceof Error ? err.message : String(err),
      });
      // Not a raster sharp can handle (or corrupt) — serve the original.
      outBody = Buffer.from(originalBody);
      contentType = originalContentType ?? 'application/octet-stream';
    }
  }

  // 3. Persist the derivative so the S3 origin serves the next cold hit.
  //    Best effort: a failed write must not fail the response.
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: TRANSFORMED_BUCKET,
        Key: path,
        Body: outBody,
        ContentType: contentType,
        CacheControl: CACHE_CONTROL,
      })
    );
  } catch (err) {
    console.error('MediaCdn: failed to store derivative', {
      key: path,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. Serve inline, or bounce to S3 for oversized responses
  if (outBody.length > MAX_INLINE_RESPONSE) {
    return {
      statusCode: 302,
      headers: {
        location: event.rawPath,
        'cache-control': 'private, no-store',
      },
      body: '',
    };
  }
  return {
    statusCode: 200,
    headers: {
      'content-type': contentType,
      'cache-control': CACHE_CONTROL,
    },
    isBase64Encoded: true,
    body: outBody.toString('base64'),
  };
};
