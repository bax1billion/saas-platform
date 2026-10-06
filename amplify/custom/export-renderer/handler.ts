import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import sharp from 'sharp';
import { assetKeys, validateDocument, type DocumentModel } from '../../../lib/export/model';
import { RENDERER_VERSION, countPages, renderPdf } from './pdf';

/**
 * The export renderer: a stream handler on the ExportJob table
 * (docs/spine-services-design.md § 3). A QUEUED row with a document is
 * claimed (RENDERING, conditional on QUEUED so a replayed record is a
 * no-op), its figures are fetched from the media bucket and resized, the
 * PDF is rendered, written under exports/<orgId>/<jobId>/<fileName>, and
 * the row moves to READY with the key, hash, size and page count, or to
 * FAILED with the reason.
 *
 * This function is a raw CDK NodejsFunction (amplify/custom/export-renderer/
 * resource.ts) because @react-pdf/renderer cannot be bundled: its pdfkit
 * core loads the standard fonts through package subpath imports that
 * esbuild leaves unresolved. The package is installed into the asset
 * instead, like sharp for the media CDN. A raw function has no
 * `allow.resource` grant on the schema, so it updates its own job row
 * through the table directly rather than over AppSync; the row still
 * streams into the audit trail like every other write.
 */

const TABLE = process.env.EXPORT_JOB_TABLE ?? '';
const BUCKET = process.env.EXPORTS_BUCKET ?? '';
const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fonts');
const MAX_IMAGE_EDGE = 1400;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

interface JobImage {
  id: string;
  orgId: string;
  status: string;
  format: string;
  fileName: string;
  document: string | DocumentModel;
}

const image = (img?: Record<string, AttributeValue>) => (img ? (unmarshall(img) as JobImage) : null);

async function claim(id: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { id },
        UpdateExpression: 'SET #s = :r, updatedAt = :now',
        ConditionExpression: '#s = :q',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':r': 'RENDERING', ':q': 'QUEUED', ':now': new Date().toISOString() },
      })
    );
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

async function finish(id: string, fields: Record<string, unknown>) {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  for (const [k, v] of Object.entries({ ...fields, updatedAt: new Date().toISOString() })) {
    names[`#${k}`] = k;
    values[`:${k}`] = v;
    sets.push(`#${k} = :${k}`);
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { id },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

async function loadImage(key: string): Promise<Buffer | null> {
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = Buffer.from(await obj.Body!.transformToByteArray());
    // Resize for print, strip metadata (location data never rides along),
    // re-encode as JPEG so the renderer sees one format.
    return await sharp(bytes).rotate().resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  } catch (err) {
    console.warn('export-renderer: image skipped', { key, error: (err as Error).message });
    return null;
  }
}

export async function renderJob(job: JobImage): Promise<void> {
  const doc = (typeof job.document === 'string' ? JSON.parse(job.document) : job.document) as DocumentModel;
  const problems = validateDocument(doc);
  if (problems.length) throw new Error(problems[0]);
  if (job.format !== 'PDF') throw new Error(`${job.format} is not rendered yet.`);

  const images = new Map<string, Buffer>();
  for (const key of assetKeys(doc)) {
    const bytes = await loadImage(key);
    if (bytes) images.set(key, bytes);
  }

  const pdf = await renderPdf(doc, { images }, FONTS_DIR);
  const sha256 = createHash('sha256').update(pdf).digest('hex');
  const s3Key = `exports/${job.orgId}/${job.id}/${job.fileName}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: pdf,
      ContentType: 'application/pdf',
      Metadata: { 'export-job': job.id, sha256, renderer: RENDERER_VERSION },
    })
  );
  await finish(job.id, {
    status: 'READY',
    s3Key,
    sha256,
    sizeBytes: pdf.length,
    pageCount: countPages(pdf),
    rendererVersion: RENDERER_VERSION,
    error: null,
  });
  console.log('export-renderer: ready', { id: job.id, bytes: pdf.length, images: images.size });
}

async function handleRecord(record: DynamoDBRecord): Promise<void> {
  if (record.eventName !== 'INSERT') return;
  const job = image(record.dynamodb?.NewImage as Record<string, AttributeValue> | undefined);
  if (!job || job.status !== 'QUEUED') return;
  if (!(await claim(job.id))) return;
  try {
    await renderJob(job);
  } catch (err) {
    const message = (err as Error).message?.slice(0, 500) ?? 'Render failed';
    console.error('export-renderer: failed', { id: job.id, message });
    await finish(job.id, { status: 'FAILED', error: message, rendererVersion: RENDERER_VERSION });
  }
}

export const handler = async (event: DynamoDBStreamEvent) => {
  if (!TABLE || !BUCKET) throw new Error('EXPORT_JOB_TABLE and EXPORTS_BUCKET must be set');
  for (const record of event.Records) {
    await handleRecord(record);
  }
};
