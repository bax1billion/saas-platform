import { defineStorage } from '@aws-amplify/backend';

/**
 * Foundation storage layout:
 *   uploads/{entity_id}/*  — vertical file uploads (validated by the
 *                            s3-file-trigger pipeline)
 *   exports/{entity_id}/*  — generated export artifacts
 *   logos/{entity_id}/*    — organization logos
 *
 * Verticals needing distinct prefixes add them here and mirror the change
 * in the S3 notification config in amplify/backend.ts.
 */
export const storage = defineStorage({
  name: 'appFiles',
  access: (allow) => ({
    'uploads/{entity_id}/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
    ],
    'exports/{entity_id}/*': [
      allow.authenticated.to(['read', 'write']),
    ],
    'logos/{entity_id}/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
    ],
  }),
});
