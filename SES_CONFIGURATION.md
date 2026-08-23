# SES Configuration Reference

> Configuration guide for Amazon SES email infrastructure. Covers domain setup, CDK-managed resources, Lambda integration, and deliverability best practices.
>
> Domains are shown as `example.com` throughout. The real sending domain, from-address, and product name come from the product's site config / env (Phase-1 config layer).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Console Setup (One-Time Manual Steps)](#2-console-setup-one-time-manual-steps)
3. [CDK-Managed Resources](#3-cdk-managed-resources)
4. [Lambda Integration](#4-lambda-integration)
5. [Email Templates](#5-email-templates)
6. [Deliverability & Reputation](#6-deliverability--reputation)
7. [Environment-Specific Configuration](#7-environment-specific-configuration)

---

## 1. Overview

SES configuration follows a hybrid approach:

| What | Where | Why |
|------|-------|-----|
| Domain verification, DKIM, SPF | AWS Console + DNS registrar | One-time manual steps; requires DNS record creation outside AWS |
| Sandbox → production access | AWS Console (support request) | Manual approval process, no automation possible |
| MAIL FROM domain | AWS Console + DNS registrar | One-time DNS setup |
| SNS topics for bounce/complaint events | CDK (Amplify backend) | Wires into `sesWebhookHandler` Lambda; must be reproducible per environment |
| SES email templates | CDK (Amplify backend) | Change with the product; should be version-controlled |
| Configuration sets (tracking) | CDK (Amplify backend) | Event destinations tie into SNS topics defined in code |
| IAM grants for Lambda → SES | CDK (Amplify backend) | Scoped per-function; lives with function definitions |
| Lambda environment variables | CDK (Amplify backend) | Environment-aware; no hardcoded values |

---

## 2. Console Setup (One-Time Manual Steps)

These steps are performed once per AWS account (or once per environment if using separate accounts for dev/staging/prod).

### 2.1 Domain Identity Verification

1. Go to **SES Console → Identities → Create identity**
2. Select **Domain** and enter your sending domain (the domain configured in the product's site config; `example.com` below)
3. Enable **Easy DKIM** (recommended: 2048-bit)
4. SES generates three CNAME records for DKIM signing
5. Add these DNS records to your domain registrar:

```
Registrar DNS records to add:

Type    Name                                    Value
CNAME   abc123._domainkey.example.com  abc123.dkim.amazonses.com
CNAME   def456._domainkey.example.com  def456.dkim.amazonses.com
CNAME   ghi789._domainkey.example.com  ghi789.dkim.amazonses.com
```

6. Verification completes automatically once DNS propagates (typically 15-60 minutes)

### 2.2 SPF Record

Add a TXT record to your domain's DNS:

```
Type    Name                    Value
TXT     example.com    "v=spf1 include:amazonses.com ~all"
```

If an SPF record already exists, append `include:amazonses.com` to the existing record.

### 2.3 DMARC Record

Add a DMARC policy to protect against spoofing and improve deliverability:

```
Type    Name                            Value
TXT     _dmarc.example.com     "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; pct=100"
```

Start with `p=none` during initial setup to monitor without enforcement, then move to `p=quarantine` or `p=reject` once confirmed working.

### 2.4 MAIL FROM Domain (Optional but Recommended)

A custom MAIL FROM domain improves deliverability by aligning the envelope sender with your domain.

1. In SES Console → Identity → `example.com` → **Custom MAIL FROM domain**
2. Set MAIL FROM domain to `mail.example.com`
3. Add DNS records:

```
Type    Name                            Value
MX      mail.example.com       10 feedback-smtp.{region}.amazonses.com
TXT     mail.example.com       "v=spf1 include:amazonses.com ~all"
```

### 2.5 Move Out of SES Sandbox

New SES accounts are in sandbox mode (can only send to verified email addresses). To send to any address:

1. Go to **SES Console → Account dashboard**
2. Click **Request production access**
3. Fill out the form:
   - **Mail type:** Transactional (confirmation emails) + Marketing (campaigns)
   - **Website URL:** `https://example.com`
   - **Use case description:** "Transactional emails (subscription confirmation, double opt-in) and periodic newsletter campaigns for a B2B SaaS product. All recipients are double opt-in confirmed. We process bounces and complaints automatically via SNS webhook."
   - **Expected daily volume:** Start with 1,000 (can request increase later)
4. Approval typically takes 24-48 hours

### 2.6 Suppression List Configuration

1. In SES Console → **Suppression list management**
2. Enable account-level suppression for both **bounces** and **complaints**
3. This prevents SES from attempting delivery to addresses that have previously bounced or complained — an additional safety layer on top of the application-level `BOUNCED`/`COMPLAINED` status tracking

---

## 3. CDK-Managed Resources

These resources are defined in the Amplify backend and deployed via CDK. They are version-controlled and reproducible across environments.

### 3.1 SNS Topic for SES Events

```ts
// amplify/backend.ts
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

// SNS topic that receives SES bounce/complaint/delivery notifications
const sesEventsTopic = new sns.Topic(stack, 'SesEventsTopic', {
  topicName: `ses-events-${branchName}`, // environment-specific
  displayName: 'SES Event Notifications',
});

// Subscribe the sesWebhookHandler Lambda to the SNS topic
sesEventsTopic.addSubscription(
  new snsSubscriptions.LambdaSubscription(
    backend.sesWebhookHandlerFunction.resources.lambda
  )
);
```

**Console follow-up:** After first deploy, connect the SNS topic to SES:
1. SES Console → Identity → `example.com` → **Notifications**
2. Set **Bounce**, **Complaint**, and **Delivery** notifications to the deployed SNS topic
3. This is a one-time console action per environment (can also be done via CDK if the SES identity is imported)

### 3.2 SES Configuration Set

```ts
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';

// Configuration set for tracking email metrics
const configurationSet = new ses.ConfigurationSet(stack, 'SesConfigSet', {
  configurationSetName: `email-tracking-${branchName}`,
  reputationMetrics: true,
  sendingEnabled: true,
});

// Event destination: send bounce/complaint events to SNS
new ses.ConfigurationSetEventDestination(stack, 'SesEventDestination', {
  configurationSet,
  destination: {
    topic: sesEventsTopic,
  },
  events: [
    ses.EmailSendingEvent.BOUNCE,
    ses.EmailSendingEvent.COMPLAINT,
    ses.EmailSendingEvent.DELIVERY,
    ses.EmailSendingEvent.REJECT,
  ],
});
```

### 3.3 Email Templates

```ts
// Confirmation email template
new ses.CfnTemplate(stack, 'ConfirmationEmailTemplate', {
  template: {
    templateName: `confirmation-${branchName}`,
    subjectPart: 'Confirm your {ProductName} subscription', // product name from site config
    htmlPart: confirmationHtmlTemplate,  // imported from file
    textPart: confirmationTextTemplate,  // imported from file
  },
});

// Welcome email template (sent after confirmation)
new ses.CfnTemplate(stack, 'WelcomeEmailTemplate', {
  template: {
    templateName: `welcome-${branchName}`,
    subjectPart: 'Welcome to {ProductName}', // product name from site config
    htmlPart: welcomeHtmlTemplate,
    textPart: welcomeTextTemplate,
  },
});
```

Template source files live alongside the CDK definitions:
```
amplify/
  backend.ts
  ses-templates/
    confirmation.html
    confirmation.txt
    welcome.html
    welcome.txt
```

### 3.4 IAM Grants for Lambda Functions

```ts
import * as iam from 'aws-cdk-lib/aws-iam';

// Grant newsletterSubscriberTrigger permission to send emails
backend.newsletterSubscriberTriggerFunction.resources.lambda
  .addToRolePolicy(new iam.PolicyStatement({
    actions: [
      'ses:SendEmail',
      'ses:SendTemplatedEmail',
    ],
    // Scope to the verified domain identity only
    resources: [
      // The verified domain identity (sending domain from site config / env)
      `arn:aws:ses:${stack.region}:${stack.account}:identity/example.com`,
    ],
  }));

// Grant permission to use the configuration set
backend.newsletterSubscriberTriggerFunction.resources.lambda
  .addToRolePolicy(new iam.PolicyStatement({
    actions: [
      'ses:SendEmail',
      'ses:SendTemplatedEmail',
    ],
    resources: [
      `arn:aws:ses:${stack.region}:${stack.account}:configuration-set/${configurationSet.configurationSetName}`,
    ],
  }));
```

---

## 4. Lambda Integration

### 4.1 `newsletterSubscriberTrigger` Environment Variables

```ts
// amplify/functions/newsletter-subscriber-trigger/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const newsletterSubscriberTriggerFunction = defineFunction({
  name: 'newsletter-subscriber-trigger',
  entry: './handler.ts',
  layers: {
    sigv4Signer: '...',
    graphqlClient: '...',
  },
  environment: {
    APPSYNC_ENDPOINT: '',  // resolved at deploy time
    SES_FROM_ADDRESS: 'noreply@example.com',  // sending domain from site config / env
    SES_FROM_NAME: '{ProductName}',           // product name from site config
    SES_CONFIGURATION_SET: '',  // resolved at deploy time from configurationSet name
    SES_CONFIRMATION_TEMPLATE: '',  // resolved at deploy time
    SES_WELCOME_TEMPLATE: '',  // resolved at deploy time
    CONFIRM_URL_BASE: 'https://example.com/confirm',        // site URL from site config / env
    UNSUBSCRIBE_URL_BASE: 'https://example.com/unsubscribe', // site URL from site config / env
  },
  timeoutSeconds: 30,
});
```

### 4.2 Sending Email in the Handler

```ts
// amplify/functions/newsletter-subscriber-trigger/handler.ts
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({});

async function sendConfirmationEmail(subscriber: {
  email: string;
  firstName?: string;
  confirmationToken: string;
  unsubscribeToken: string;
}) {
  const confirmUrl =
    `${process.env.CONFIRM_URL_BASE}?token=${subscriber.confirmationToken}`;
  const unsubscribeUrl =
    `${process.env.UNSUBSCRIBE_URL_BASE}?token=${subscriber.unsubscribeToken}`;

  await ses.send(new SendEmailCommand({
    FromEmailAddress: `${process.env.SES_FROM_NAME} <${process.env.SES_FROM_ADDRESS}>`,
    Destination: {
      ToAddresses: [subscriber.email],
    },
    Content: {
      Template: {
        TemplateName: process.env.SES_CONFIRMATION_TEMPLATE,
        TemplateData: JSON.stringify({
          firstName: subscriber.firstName || '',
          confirmUrl,
          unsubscribeUrl,
        }),
      },
    },
    ConfigurationSetName: process.env.SES_CONFIGURATION_SET,
    ListManagementOptions: {
      ContactListName: 'newsletter-subscribers',
      TopicName: 'newsletter',
    },
  }));
}
```

### 4.3 `sesWebhookHandler` Environment Variables

```ts
// amplify/functions/ses-webhook-handler/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const sesWebhookHandlerFunction = defineFunction({
  name: 'ses-webhook-handler',
  entry: './handler.ts',
  layers: {
    sigv4Signer: '...',
    graphqlClient: '...',
  },
  environment: {
    APPSYNC_ENDPOINT: '',  // resolved at deploy time
  },
  timeoutSeconds: 30,
});
```

### 4.4 SNS Event Parsing in the Webhook Handler

```ts
// amplify/functions/ses-webhook-handler/handler.ts
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

type SESNotification = SESBounceNotification | SESComplaintNotification;

export const handler = async (event: SNSEvent) => {
  const promises = event.Records.map(async (record) => {
    const notification: SESNotification = JSON.parse(record.Sns.Message);

    if (notification.notificationType === 'Bounce') {
      const emails = notification.bounce.bouncedRecipients
        .map(r => r.emailAddress);
      const isPermanent = notification.bounce.bounceType === 'Permanent';

      for (const email of emails) {
        if (isPermanent) {
          await updateSubscriberStatus(email, 'BOUNCED');
        } else {
          await incrementBounceCount(email);
        }
      }
    }

    if (notification.notificationType === 'Complaint') {
      const emails = notification.complaint.complainedRecipients
        .map(r => r.emailAddress);

      for (const email of emails) {
        await updateSubscriberStatus(email, 'COMPLAINED');
      }
    }
  });

  return Promise.all(promises);
};
```

---

## 5. Email Templates

Templates use SES template variables (`{{variable}}`) for personalization. Source files are stored in version control and deployed via CDK.

### 5.1 Confirmation Email

**Template name:** `confirmation-{env}`

**Variables:**
| Variable | Source | Description |
|----------|--------|-------------|
| `{{firstName}}` | `NewsletterSubscriber.firstName` | Personalization (falls back to empty string) |
| `{{confirmUrl}}` | Constructed from `CONFIRM_URL_BASE` + token | Double opt-in link |
| `{{unsubscribeUrl}}` | Constructed from `UNSUBSCRIBE_URL_BASE` + token | CAN-SPAM required |

**Subject:** "Confirm your {ProductName} subscription"

**Body guidelines** (aligned with the product's brand voice):
- Tone: Reassuring, straightforward — "Thanks for your interest in {ProductName}."
- Brief value reminder: one sentence stating the product's core value proposition. Example (compliance vertical): "We help manufacturers stay audit-ready with defensible records."
- Clear CTA: "Confirm my subscription" button linking to `{{confirmUrl}}`
- No pressure, no false urgency
- Footer: unsubscribe link, physical mailing address (CAN-SPAM), privacy policy link

### 5.2 Welcome Email

**Template name:** `welcome-{env}`

**Sent:** After subscriber clicks confirmation link (status → CONFIRMED)

**Variables:**
| Variable | Source | Description |
|----------|--------|-------------|
| `{{firstName}}` | `NewsletterSubscriber.firstName` | Personalization |
| `{{unsubscribeUrl}}` | Constructed from token | CAN-SPAM required |

**Subject:** "Welcome to {ProductName}"

**Body guidelines:**
- Brief welcome: "You're confirmed. Here's what's coming."
- Value preview: highlight 2-3 key product features. Example (compliance vertical): Compliance Library, Evidence Tracker, Training Matrix
- Soft CTA: "Learn more about how {ProductName} works" → link to product page or blog
- Set expectations: "We'll send occasional updates — no spam, ever."
- Footer: same compliance elements as confirmation email

### 5.3 Campaign Email (Future)

**Template name:** `campaign-{env}`

Used for periodic newsletter sends to `CONFIRMED` subscribers. Template structure TBD — will include:
- Personalization via `firstName`, `company`
- Dynamic content blocks
- Unsubscribe link per subscriber
- Physical address and CAN-SPAM compliance footer

---

## 6. Deliverability & Reputation

### 6.1 Sending Practices

- **Double opt-in only** — never send to unconfirmed addresses
- **Immediate bounce/complaint processing** — `sesWebhookHandler` updates subscriber status in near real-time
- **Rate limiting** — respect SES sending limits (start at 200/day in sandbox, increases in production)
- **List hygiene** — only send campaigns to `status = CONFIRMED`; filter out `BOUNCED`, `COMPLAINED`, `UNSUBSCRIBED`
- **Track `lastEmailSentAt`** — avoid sending to the same subscriber more than once per week (configurable)

### 6.2 Monitoring

- **SES Console → Reputation dashboard** — monitor bounce rate (target: < 5%) and complaint rate (target: < 0.1%)
- **Configuration set metrics** — delivery, bounce, complaint, and reject rates per email type
- **CloudWatch alarms** (future):
  - Alert if bounce rate exceeds 3%
  - Alert if complaint rate exceeds 0.05%
  - Alert if `sesWebhookHandler` Lambda errors spike

### 6.3 SES Sending Limits

| Environment | Limit | Notes |
|-------------|-------|-------|
| Sandbox | 200 emails/day, 1 email/second | Verified recipients only |
| Production (initial) | 50,000 emails/day, 14 emails/second | Typical initial grant |
| Production (scaled) | Request increase via SES Console | Based on sending history and reputation |

---

## 7. Environment-Specific Configuration

| Variable | Development | Staging | Production |
|----------|-------------|---------|------------|
| `SES_FROM_ADDRESS` | `noreply@dev.example.com` | `noreply@staging.example.com` | `noreply@example.com` |
| `CONFIRM_URL_BASE` | `http://localhost:3000/confirm` | `https://staging.example.com/confirm` | `https://example.com/confirm` |
| `UNSUBSCRIBE_URL_BASE` | `http://localhost:3000/unsubscribe` | `https://staging.example.com/unsubscribe` | `https://example.com/unsubscribe` |
| SES identity | Sandbox (verified test emails only) | Sandbox or production | Production |
| SNS topic | `ses-events-dev` | `ses-events-staging` | `ses-events-main` |
| Configuration set | `email-tracking-dev` | `email-tracking-staging` | `email-tracking-main` |
| Templates | `confirmation-dev`, etc. | `confirmation-staging`, etc. | `confirmation-main`, etc. |

**Development notes:**
- In sandbox mode, add test recipient emails as verified identities in the SES console
- Use SES's built-in email simulator addresses for testing bounces and complaints:
  - `bounce@simulator.amazonses.com` — triggers a hard bounce
  - `complaint@simulator.amazonses.com` — triggers a complaint
  - `success@simulator.amazonses.com` — successful delivery
- These simulators do not affect your sending reputation

---

*End of SES configuration reference.*
