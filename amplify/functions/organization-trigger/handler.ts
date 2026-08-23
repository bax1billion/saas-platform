import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { verticalOrgSeeds } from '../../data/vertical';

/**
 * Fires on Organization INSERT — the hook for provisioning a new tenant's
 * defaults. Seed records are defined per product in
 * amplify/data/vertical.ts (verticalOrgSeeds); an empty list is a no-op.
 */
export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  const promises = event.Records.map(async (record: DynamoDBRecord) => {
    const { eventName } = record;
    const newImage = record.dynamodb?.NewImage;

    if (eventName === 'INSERT' && newImage) {
      const orgId = record.dynamodb?.Keys?.id?.S;
      const orgName = newImage.name?.S;
      console.log('OrganizationTrigger: New org created, provisioning defaults', { orgId, orgName });

      // TODO: For each verticalOrgSeeds entry:
      //   → Call the vertical's create mutation via SigV4-signed AppSync
      //     request with orgId + the seed record's fields
      for (const seed of verticalOrgSeeds) {
        console.log('OrganizationTrigger: Would create seed record', { orgId, ...seed });
      }
    }
  });

  await Promise.all(promises);
};
