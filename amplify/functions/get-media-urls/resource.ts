import { defineFunction, secret } from '@aws-amplify/backend';

/**
 * Signs media-CDN access for the caller (getMediaAccess query). The
 * MEDIA_CDN_PRIVATE_KEY secret must exist in every environment (a
 * placeholder value is fine until signed mode is enabled — the handler
 * degrades to { enabled: false } when it isn't a usable key).
 * MEDIA_CDN_DOMAIN / MEDIA_CDN_KEY_PAIR_ID are injected by backend.ts.
 */
export const getMediaUrlsFunction = defineFunction({
  name: 'get-media-urls',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 15,
  resourceGroupName: 'data',
  environment: {
    MEDIA_CDN_PRIVATE_KEY: secret('MEDIA_CDN_PRIVATE_KEY'),
  },
});
