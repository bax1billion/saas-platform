import type { SNSEvent } from 'aws-lambda';

interface SESBounceNotification {
  notificationType: 'Bounce';
  bounce: {
    bounceType: 'Permanent' | 'Transient';
    bouncedRecipients: Array<{ emailAddress: string }>;
  };
}

interface SESComplaintNotification {
  notificationType: 'Complaint';
  complaint: {
    complainedRecipients: Array<{ emailAddress: string }>;
  };
}

interface SESDeliveryNotification {
  notificationType: 'Delivery';
}

type SESNotification = SESBounceNotification | SESComplaintNotification | SESDeliveryNotification;

export const handler = async (event: SNSEvent): Promise<void> => {
  const promises = event.Records.map(async (record) => {
    const notification: SESNotification = JSON.parse(record.Sns.Message);

    if (notification.notificationType === 'Bounce') {
      const emails = notification.bounce.bouncedRecipients.map((r) => r.emailAddress);
      const isPermanent = notification.bounce.bounceType === 'Permanent';

      for (const email of emails) {
        if (isPermanent) {
          console.log('SESWebhookHandler: Hard bounce', { email });
          // TODO: Query NewsletterSubscriber.byEmail → update status → BOUNCED
        } else {
          console.log('SESWebhookHandler: Soft bounce', { email });
          // TODO: Query NewsletterSubscriber.byEmail → increment emailBounceCount
          // TODO: If emailBounceCount >= 3 → update status → BOUNCED
        }
      }
    }

    if (notification.notificationType === 'Complaint') {
      const emails = notification.complaint.complainedRecipients.map((r) => r.emailAddress);

      for (const email of emails) {
        console.log('SESWebhookHandler: Complaint', { email });
        // TODO: Query NewsletterSubscriber.byEmail → update status → COMPLAINED
      }
    }

    if (notification.notificationType === 'Delivery') {
      // Successful delivery — no action needed
    }
  });

  await Promise.all(promises);
};
