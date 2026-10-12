import type { Schema } from '../../data/resource';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { graphql } from '../../shared/graphql';
import { exportProviders } from '../../data/export-providers';
import { ADMIN } from '../../shared/constants';
import { queueExportJob } from '../../shared/export/queue';
import { operationName, type OperationEvent } from '../../shared/appsync-event';

/**
 * Two operations, dispatched by field name like the module commands:
 *
 *   requestExport(recordType, recordId, format, template, affirmed)
 *     A command because the request must be refused BEFORE a row exists
 *     (docs/modules.md → "The exception"): no provider for the record
 *     type, the caller may not export it, the person did not affirm, or a
 *     suggested value is still unconfirmed. On success writes one
 *     ExportJob row (QUEUED, with the document) over AppSync as this
 *     function's IAM role; the renderer does the rest from the stream.
 *
 *   getExportDownload(jobId)
 *     A presigned S3 GET for a READY job, after checking the job belongs
 *     to the caller's org. Exports are not media: they never go through
 *     the image CDN, and the client has no direct S3 read on exports/.
 *
 * Every row this function loads is compared with the caller's org,
 * because a Lambda bypasses the model rules (CLAUDE.md).
 */

const BUCKET = process.env.EXPORTS_BUCKET ?? '';
const DOWNLOAD_TTL_SECONDS = 15 * 60;

type Identity = { sub?: string; groups?: string[] | null } | null | undefined;

async function resolveCaller(identity: Identity): Promise<{ sub: string; orgId: string; groups: string[] }> {
  const sub = identity?.sub;
  if (!sub) throw new Error('Sign in to export.');
  const res = await graphql<{ usersByCognitoSub: { items: Array<{ orgId: string | null }> } }>(
    `query BySub($sub: String!) { usersByCognitoSub(cognitoSub: $sub, limit: 1) { items { orgId } } }`,
    { sub }
  );
  const orgId = res.usersByCognitoSub.items[0]?.orgId;
  if (!orgId) throw new Error('Complete onboarding before exporting.');
  return { sub, orgId, groups: identity?.groups ?? [] };
}

type RequestArgs = Schema['requestExport']['args'];
type DownloadArgs = Schema['getExportDownload']['args'];

export async function requestExport(args: RequestArgs, identity: Identity) {
  const caller = await resolveCaller(identity);
  if (!caller.groups.includes(ADMIN) && !caller.groups.includes('Member')) {
    throw new Error('Viewers cannot export. Ask a member or an admin.');
  }
  if (args.affirmed !== true) {
    throw new Error('Affirm that you have reviewed the document before exporting it.');
  }
  const provider = exportProviders[args.recordType];
  if (!provider) throw new Error(`Nothing exports a "${args.recordType}" record yet.`);

  const { job } = await queueExportJob({
    provider,
    format: args.format,
    template: args.template,
    recordId: args.recordId,
    caller,
    graphql,
  });
  return job;
}

export async function getExportDownload(args: DownloadArgs, identity: Identity) {
  const caller = await resolveCaller(identity);
  const res = await graphql<{
    getExportJob: { id: string; orgId: string; status: string; s3Key: string | null; fileName: string; isDeleted: boolean | null } | null;
  }>(`query J($id: ID!) { getExportJob(id: $id) { id orgId status s3Key fileName isDeleted } }`, { id: args.jobId });
  const job = res.getExportJob;
  if (!job || job.orgId !== caller.orgId || job.isDeleted) throw new Error('That export is not available.');
  if (job.status !== 'READY' || !job.s3Key) throw new Error(`That export is ${job.status.toLowerCase()}, not ready.`);
  if (!BUCKET) throw new Error('Export storage is not configured.');

  const s3 = new S3Client({});
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: job.s3Key,
      ResponseContentDisposition: `attachment; filename="${job.fileName.replace(/"/g, '')}"`,
    }),
    { expiresIn: DOWNLOAD_TTL_SECONDS }
  );
  return {
    url,
    fileName: job.fileName,
    expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString(),
  };
}

type AnyEvent = OperationEvent & {
  arguments: Record<string, unknown>;
  identity: Identity;
};

export const handler = async (event: AnyEvent) => {
  const field = operationName(event);
  switch (field) {
    case 'requestExport':
      return requestExport(event.arguments as RequestArgs, event.identity);
    case 'getExportDownload':
      return getExportDownload(event.arguments as DownloadArgs, event.identity);
    default:
      throw new Error(`Unknown field ${field}`);
  }
};
