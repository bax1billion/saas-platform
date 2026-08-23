import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  const promises = event.Records.map(async (record: DynamoDBRecord) => {
    const { eventName } = record;
    const newImage = record.dynamodb?.NewImage;
    const oldImage = record.dynamodb?.OldImage;

    if (!newImage && !oldImage) return;

    // TODO: Determine entity type from event source ARN
    // TODO: Extract actorUserId from the source record's actor field (e.g. uploadedBy / createdBy)
    // TODO: Determine action (CREATED, UPDATED, STATUS_CHANGED, DELETED, or a vertical action)
    // TODO: Build payload (JSON diff for MODIFY, snapshot for INSERT)
    // TODO: Call createEventLog AppSync mutation via SigV4-signed request

    if (eventName === 'INSERT') {
      console.log('EventLogger: INSERT detected', JSON.stringify(record.dynamodb?.Keys));
    } else if (eventName === 'MODIFY') {
      // Skip if only updatedAt changed (Amplify auto-touch)
      console.log('EventLogger: MODIFY detected', JSON.stringify(record.dynamodb?.Keys));
    } else if (eventName === 'REMOVE') {
      console.log('EventLogger: REMOVE detected', JSON.stringify(record.dynamodb?.Keys));
    }
  });

  await Promise.all(promises);
};
