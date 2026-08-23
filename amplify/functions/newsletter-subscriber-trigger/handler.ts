import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  const promises = event.Records.map(async (record: DynamoDBRecord) => {
    const { eventName } = record;
    const newImage = record.dynamodb?.NewImage;
    const oldImage = record.dynamodb?.OldImage;

    if (eventName === 'INSERT' && newImage) {
      const email = newImage.email?.S;
      const status = newImage.status?.S;

      if (status === 'PENDING' && email) {
        console.log('NewsletterSubscriberTrigger: New subscriber', { email });

        // TODO: Normalize email (lowercase, trim)
        // TODO: Deduplicate check (query byEmail index)
        //   - If exists CONFIRMED → skip
        //   - If exists PENDING → resend confirmation
        //   - If exists UNSUBSCRIBED → re-subscribe
        // TODO: Generate confirmationToken (UUID v4) and unsubscribeToken (UUID v4)
        // TODO: Update NewsletterSubscriber record with tokens
        // TODO: Send confirmation email via SES (using SES template)
        // TODO: Update lastEmailSentAt
      }
    }

    if (eventName === 'MODIFY' && newImage && oldImage) {
      const newStatus = newImage.status?.S;
      const oldStatus = oldImage.status?.S;

      if (newStatus === 'CONFIRMED' && oldStatus !== 'CONFIRMED') {
        console.log('NewsletterSubscriberTrigger: Subscriber confirmed', { email: newImage.email?.S });

        // TODO: Set confirmedAt = now
        // TODO: (Optional) Send welcome email via SES
      }

      if (newStatus === 'UNSUBSCRIBED' && oldStatus !== 'UNSUBSCRIBED') {
        console.log('NewsletterSubscriberTrigger: Subscriber unsubscribed', { email: newImage.email?.S });

        // TODO: Set unsubscribedAt = now
      }
    }
  });

  await Promise.all(promises);
};
