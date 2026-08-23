import type { S3Event } from 'aws-lambda';

/**
 * Validation pipeline for files landing under uploads/. Key layout:
 * "uploads/{orgId}/{entityId}/{fileName}" (see amplify/storage/resource.ts).
 */
export const handler = async (event: S3Event): Promise<void> => {
  const promises = event.Records.map(async (record) => {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const size = record.s3.object.size;

    const segments = key.split('/');
    const prefix = segments[0];
    const orgId = segments[1];
    const entityId = segments[2];
    const fileName = segments.slice(3).join('/');

    // Only validate uploads/ (exports/ and logos/ are not user documents)
    if (prefix !== 'uploads') {
      console.log('S3FileTrigger: Skipping non-upload path', { key });
      return;
    }

    console.log('S3FileTrigger: Processing upload', { bucket, orgId, entityId, fileName, size });

    // TODO: Read S3 object metadata (Content-Type, Content-Length)
    // TODO: Validate file type against an allowlist
    // TODO: Validate file size against limits
    // TODO: Stream S3 object through SHA-256 hash function
    // TODO: (Optional) Malware scan
    // TODO: Update the owning vertical record via AppSync mutation:
    //   fileHash, fileValidationStatus, mimeType, fileSize
    // ON ERROR: Update record with fileValidationStatus → INVALID, fileValidationMessage
  });

  await Promise.all(promises);
};
