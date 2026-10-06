import { defineStorage } from '@aws-amplify/backend';

/**
 * Foundation storage layout:
 *   uploads/{entity_id}/*  — vertical file uploads (validated by the
 *                            s3-file-trigger pipeline)
 *   exports/<orgId>/<jobId>/* — rendered exports (docs/spine-services-design.md
 *                            § 3). Lambda-only: the renderer writes, the
 *                            export-request function presigns downloads
 *                            after an org check; no client rule, so no
 *                            signed-in user can read another org's file
 *   logos/{entity_id}/*    — organization logos
 *
 * S3 is the upload and origin location only. Media under uploads/ is
 * never read from S3 by a client: every read goes through the private
 * media CDN (amplify/custom/media-cdn, docs/image-delivery.md), whose
 * signer applies record-level access (docs/record-access.md). Hence
 * `write` only on uploads/ — no `read` (no presigned GETs), no `delete`
 * (originals are immutable; "delete" is a soft-delete on the record).
 *
 * Verticals needing distinct prefixes add them here and mirror the change
 * in the S3 notification config and CDN prefix list in amplify/backend.ts.
 *
 * Grantees: a signed-in user who belongs to a Cognito group assumes that
 * group's IAM role, not the authenticated role, so `allow.authenticated`
 * alone reaches nobody in a group (every real user is in one). Each rule
 * therefore names the org groups as well; Operator is left out on purpose
 * (no standing access to org data). The Location construct in
 * amplify/backend.ts grants the same set of roles for the same reason.
 */
const ORG_GROUPS = ['Admin', 'Member', 'Viewer'];
export const storage = defineStorage({
  name: 'appFiles',
  access: (allow) => ({
    'uploads/{entity_id}/*': [
      allow.authenticated.to(['write']),
      allow.groups(ORG_GROUPS).to(['write']),
    ],
    'logos/{entity_id}/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
      allow.groups(ORG_GROUPS).to(['read', 'write', 'delete']),
    ],
  }),
});
