import { defineFunction } from '@aws-amplify/backend';

export const newsletterSubscriberTriggerFunction = defineFunction({
  name: 'newsletter-subscriber-trigger',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});
