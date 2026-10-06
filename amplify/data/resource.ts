import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { eventLoggerFunction } from '../functions/event-logger/resource';
import { organizationTriggerFunction } from '../functions/organization-trigger/resource';
import { s3FileTriggerFunction } from '../functions/s3-file-trigger/resource';
import { newsletterSubscriberTriggerFunction } from '../functions/newsletter-subscriber-trigger/resource';
import { sesWebhookHandlerFunction } from '../functions/ses-webhook-handler/resource';
import { stripeWebhookHandlerFunction } from '../functions/stripe-webhook-handler/resource';
import { createCheckoutSessionFunction } from '../functions/create-checkout-session/resource';
import { createOrganizationFunction } from '../functions/create-organization/resource';
import { getMediaUrlsFunction } from '../functions/get-media-urls/resource';
import { exportRequestFunction } from '../functions/export-request/resource';
import { assistRunFunction } from '../functions/assist-run/resource';
import {
  verticalModels,
  verticalEntityTypes,
  verticalEventActions,
  verticalFunctions,
} from './vertical';

/**
 * Foundation schema — tenancy, auth, billing, audit trail, newsletter.
 * Product-specific domain models live in ./vertical.ts and are merged in
 * below; this file should not need editing per product.
 */
const schema = a
  .schema({
    // ═══════════════════════════════════════════════════════════════════
    // Enums
    // ═══════════════════════════════════════════════════════════════════

    /** Lifecycle for uploaded files (used by vertical file-bearing models
     *  and the s3-file-trigger validation pipeline). */
    FileValidationStatus: a.enum([
      'PENDING',
      'VALID',
      'INVALID',
      'QUARANTINED',
    ]),

    SubscriberStatus: a.enum([
      'PENDING',
      'CONFIRMED',
      'UNSUBSCRIBED',
      'BOUNCED',
      'COMPLAINED',
    ]),

    SubscriberSource: a.enum([
      'HOMEPAGE_HERO',
      'HOMEPAGE_PRICING',
      'FOOTER',
      'BLOG',
      'REFERRAL',
      'OTHER',
    ]),

    SubscriptionTier: a.enum(['CORE', 'GROWTH', 'SCALE', 'TRIAL']),

    /** Mirrors Stripe subscription status values. */
    SubscriptionStatus: a.enum([
      'TRIALING',
      'ACTIVE',
      'PAST_DUE',
      'UNPAID',
      'CANCELED',
      'INCOMPLETE',
      'INCOMPLETE_EXPIRED',
      'PAUSED',
    ]),

    /** Audit-trail actions; verticals append theirs in vertical.ts. */
    EventAction: a.enum([
      'CREATED',
      'UPDATED',
      'DELETED',
      'STATUS_CHANGED',
      'EXPORTED',
      'FILE_VALIDATED',
      'FILE_QUARANTINED',
      'SUBSCRIBER_CONFIRMED',
      'SUBSCRIBER_UNSUBSCRIBED',
      'SUBSCRIPTION_CREATED',
      'SUBSCRIPTION_UPDATED',
      'SUBSCRIPTION_CANCELED',
      'PAYMENT_SUCCEEDED',
      'PAYMENT_FAILED',
      ...verticalEventActions,
    ]),

    /** Audit-trail entity types; verticals append theirs in vertical.ts. */
    EntityType: a.enum([
      'ORGANIZATION',
      'USER',
      'SITE',
      'NEWSLETTER_SUBSCRIBER',
      'SUBSCRIPTION',
      'STRIPE_WEBHOOK_EVENT',
      'ORG_ENTITLEMENT_OVERRIDE',
      'TESTER_FLAG',
      'EXPORT_JOB',
      'ASSIST_EVENT',
      ...verticalEntityTypes,
    ]),

    // ═══════════════════════════════════════════════════════════════════
    // Models
    // ═══════════════════════════════════════════════════════════════════

    Organization: a
      .model({
        name: a.string().required(),
        slug: a.string().required(),
        industry: a.string(),
        address: a.string(),
        phone: a.string(),
        website: a.string(),
        logoS3Key: a.string(),
        settings: a.json(),
        stripeCustomerId: a.string(),
        isActive: a.boolean().default(true),
        users: a.hasMany('User', 'orgId'),
        sites: a.hasMany('Site', 'orgId'),
        subscriptions: a.hasMany('OrgSubscription', 'orgId'),
        entitlementOverrides: a.hasMany('OrgEntitlementOverride', 'orgId'),
      })
      .secondaryIndexes((index) => [
        index('slug').queryField('organizationsBySlug'),
        index('stripeCustomerId').queryField(
          'organizationsByStripeCustomerId'
        ),
      ])
      .authorization((allow) => [
        allow.group('Admin').to(['create', 'read', 'update', 'delete']),
        allow.groups(['Member', 'Viewer']).to(['read']),
      ]),

    User: a
      .model({
        orgId: a.id(),
        cognitoSub: a.string().required(),
        email: a.string().required(),
        firstName: a.string(),
        lastName: a.string(),
        role: a.string(),
        jobTitle: a.string(),
        isActive: a.boolean().default(true),
        lastLoginAt: a.datetime(),
        sortDate: a.datetime().required(),
        organization: a.belongsTo('Organization', 'orgId'),
      })
      .secondaryIndexes((index) => [
        index('orgId').sortKeys(['sortDate']).queryField('usersByOrg'),
        index('cognitoSub').queryField('usersByCognitoSub'),
      ])
      .authorization((allow) => [
        allow.group('Admin').to(['create', 'read', 'update', 'delete']),
        allow.groups(['Member', 'Viewer']).to(['read']),
      ]),

    Site: a
      .model({
        orgId: a.id().required(),
        name: a.string().required(),
        siteCode: a.string(),
        address: a.string(),
        isActive: a.boolean().default(true),
        organization: a.belongsTo('Organization', 'orgId'),
      })
      .secondaryIndexes((index) => [
        index('orgId').sortKeys(['name']).queryField('sitesByOrg'),
      ])
      .authorization((allow) => [
        allow.group('Admin').to(['create', 'read', 'update', 'delete']),
        allow.groups(['Member', 'Viewer']).to(['read']),
      ]),

    /** Flag it: a tester's report from any screen, filled in with where
     *  they were. Any signed-in person may file one; Admins and Operators
     *  read the inbox. */
    TesterFlag: a
      .model({
        orgId: a.id(),
        product: a.string(),
        screen: a.string().required(),
        role: a.string(),
        device: a.string(),
        version: a.string(),
        happened: a.string().required(),
        expected: a.string(),
        createdBy: a.string(),
        status: a.string().default('OPEN'),
        sortDate: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('orgId').sortKeys(['sortDate']).queryField('testerFlagsByOrg'),
        index('status').sortKeys(['sortDate']).queryField('testerFlagsByStatus'),
      ])
      .authorization((allow) => [
        allow.authenticated().to(['create']),
        allow.groups(['Admin', 'Operator']).to(['read', 'update']),
      ]),

    /** What a person did with an Assist suggestion. */
    AssistEventState: a.enum(['PROPOSED', 'ACCEPTED', 'EDITED', 'REJECTED']),

    /** One Assist run and its outcome (docs/spine-services-design.md § 2.3):
     *  which helper, prompt and model, the hash of what it was allowed to
     *  read, what it proposed, what the person kept, who decided. Written
     *  only by the assist-run function; org groups read. This is the
     *  Assist log tab on a record. */
    AssistEvent: a
      .model({
        orgId: a.id().required(),
        helperId: a.string().required(),
        /** Module id that owns the helper. */
        product: a.string().required(),
        promptVersion: a.string().required(),
        /** Inference profile id, or "rules" when no model was called. */
        modelId: a.string().required(),
        recordType: a.string().required(),
        recordId: a.id().required(),
        targetId: a.id(),
        /** SHA-256 of the allow-listed input; the cache key with prompt and model. */
        inputHash: a.string().required(),
        /** The helper's output, as JSON. */
        output: a.json().required(),
        /** What the person kept when they edited, as JSON. */
        finalOutput: a.json(),
        tokensIn: a.integer(),
        tokensOut: a.integer(),
        cached: a.boolean(),
        state: a.ref('AssistEventState').required(),
        requestedBy: a.string(),
        decidedBy: a.string(),
        decidedAt: a.datetime(),
        sortDate: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('orgId').sortKeys(['sortDate']).queryField('assistEventsByOrg'),
        index('recordId').sortKeys(['sortDate']).queryField('assistEventsByRecord'),
      ])
      .disableOperations(['subscriptions'])
      .authorization((allow) => [allow.groups(['Admin', 'Member', 'Viewer']).to(['read'])]),

    /** Assist runs and tokens per org per month; id is `<orgId>#<yyyy-mm>`.
     *  The cost meter: over the cap, helpers fall back to rules only. */
    AssistUsage: a
      .model({
        orgId: a.id().required(),
        month: a.string().required(),
        runs: a.integer().required(),
        tokensIn: a.integer().required(),
        tokensOut: a.integer().required(),
      })
      .secondaryIndexes((index) => [index('orgId').sortKeys(['month']).queryField('assistUsageByOrg')])
      .disableOperations(['subscriptions'])
      .authorization((allow) => [allow.groups(['Admin']).to(['read'])]),

    /** Document export formats the export service renders. */
    ExportFormat: a.enum(['PDF', 'DOCX']),
    ExportStatus: a.enum(['QUEUED', 'RENDERING', 'READY', 'FAILED']),

    /** One export of one record (docs/spine-services-design.md § 3): the
     *  document model the product built, then what the renderer made of it.
     *  Written only by the export functions (the request command over
     *  AppSync, the renderer through the table); org groups read. The row
     *  is also the export log: who asked, the data date, the hash. */
    ExportJob: a
      .model({
        orgId: a.id().required(),
        /** Provider key the product registers (amplify/data/export-providers.ts). */
        recordType: a.string().required(),
        recordId: a.id().required(),
        /** `<template id>@<version>` the document was built with. */
        template: a.string(),
        format: a.ref('ExportFormat').required(),
        status: a.ref('ExportStatus').required(),
        fileName: a.string().required(),
        /** The document model (lib/export/model.ts), as JSON. */
        document: a.json().required(),
        /** When the data was read; printed on the document, stamped in the file. */
        dataDate: a.datetime().required(),
        requestedBy: a.string(),
        s3Key: a.string(),
        sha256: a.string(),
        sizeBytes: a.integer(),
        pageCount: a.integer(),
        rendererVersion: a.string(),
        error: a.string(),
        isDeleted: a.boolean().default(false),
        sortDate: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('orgId').sortKeys(['sortDate']).queryField('exportJobsByOrg'),
        index('recordId').sortKeys(['sortDate']).queryField('exportJobsByRecord'),
      ])
      .disableOperations(['subscriptions'])
      .authorization((allow) => [
        allow.groups(['Admin', 'Member', 'Viewer']).to(['read']),
      ]),

    /** Append-only audit trail, written by the event-logger Lambda from
     *  DynamoDB streams. Read-only to all groups. */
    EventLog: a
      .model({
        orgId: a.id().required(),
        siteId: a.id(),
        actorUserId: a.id().required(),
        actorEmail: a.string(),
        entityType: a.ref('EntityType').required(),
        entityId: a.id().required(),
        entityKey: a.string(), // Computed: `${entityType}#${entityId}` — set by eventLogger Lambda
        action: a.ref('EventAction').required(),
        payload: a.json(),
        ipAddress: a.string(),
        sortDate: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('orgId').sortKeys(['sortDate']).queryField('eventLogsByOrg'),
        index('entityKey')
          .sortKeys(['sortDate'])
          .queryField('eventLogsByEntity'),
        index('actorUserId')
          .sortKeys(['sortDate'])
          .queryField('eventLogsByActor'),
        index('siteId')
          .sortKeys(['sortDate'])
          .queryField('eventLogsBySite'),
      ])
      .authorization((allow) => [
        allow.groups(['Admin', 'Member', 'Viewer']).to(['read']),
      ]),

    NewsletterSubscriber: a
      .model({
        email: a.string().required(),
        firstName: a.string(),
        lastName: a.string(),
        company: a.string(),
        jobTitle: a.string(),
        source: a.ref('SubscriberSource').required(),
        status: a.ref('SubscriberStatus').required(),
        confirmationToken: a.string(),
        confirmedAt: a.datetime(),
        unsubscribedAt: a.datetime(),
        unsubscribeToken: a.string(),
        referralCode: a.string(),
        ipAddress: a.string(),
        userAgent: a.string(),
        tags: a.string().array(),
        lastEmailSentAt: a.datetime(),
        emailBounceCount: a.integer(),
        metadata: a.json(),
        sortDate: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('email').queryField('subscribersByEmail'),
        index('status')
          .sortKeys(['sortDate'])
          .queryField('subscribersByStatus'),
        index('source')
          .sortKeys(['sortDate'])
          .queryField('subscribersBySource'),
        index('confirmationToken').queryField(
          'subscribersByConfirmationToken'
        ),
        index('unsubscribeToken').queryField('subscribersByUnsubscribeToken'),
      ])
      .authorization((allow) => [
        allow.publicApiKey().to(['create']),
        allow.group('Admin').to(['read', 'update']),
      ]),

    /** Stripe subscription mirror — written only by the stripe-webhook
     *  handler. */
    OrgSubscription: a
      .model({
        orgId: a.id().required(),
        stripeSubscriptionId: a.string().required(),
        stripeCustomerId: a.string().required(),
        stripePriceId: a.string().required(),
        stripeProductId: a.string(),
        tier: a.ref('SubscriptionTier').required(),
        status: a.ref('SubscriptionStatus').required(),
        /** Add-on module ids (config/modules.ts) mirrored from the
         *  subscription's line items — Stripe Product metadata `module=<id>`.
         *  See docs/modules.md. */
        modules: a.string().array(),
        currentPeriodStart: a.datetime(),
        currentPeriodEnd: a.datetime(),
        trialStart: a.datetime(),
        trialEnd: a.datetime(),
        cancelAtPeriodEnd: a.boolean(),
        canceledAt: a.datetime(),
        endedAt: a.datetime(),
        latestInvoiceId: a.string(),
        latestInvoiceStatus: a.string(),
        latestInvoiceUrl: a.string(),
        metadata: a.json(),
        sortDate: a.datetime().required(),
        organization: a.belongsTo('Organization', 'orgId'),
      })
      .secondaryIndexes((index) => [
        index('orgId')
          .sortKeys(['sortDate'])
          .queryField('subscriptionsByOrg'),
        index('stripeSubscriptionId').queryField(
          'subscriptionsByStripeSubscriptionId'
        ),
        index('stripeCustomerId')
          .sortKeys(['sortDate'])
          .queryField('subscriptionsByStripeCustomerId'),
        index('status')
          .sortKeys(['currentPeriodEnd'])
          .queryField('subscriptionsByStatus'),
      ])
      .authorization((allow) => [
        allow.groups(['Admin', 'Member', 'Viewer']).to(['read']),
      ]),

    /** Platform-operator-granted entitlements: pilots, comps, and offline
     *  purchases (checks/POs, where card payments over agency limits are
     *  not allowed). Replaces the old Organization.settings overrides so
     *  org Admins cannot grant themselves access — Operator writes, org
     *  roles read. Latest record per org wins; expiresAt bounds PO terms.
     *  See docs/modules.md → Entitlements. */
    OrgEntitlementOverride: a
      .model({
        orgId: a.id().required(),
        /** "comped" grants base access without a subscription. */
        access: a.string(),
        /** Add-on module ids granted outside Stripe. */
        modules: a.string().array(),
        /** Why: "90-day founding pilot", "PO #1234 check net-30", … */
        reason: a.string(),
        /** Operator email, for the audit trail. */
        grantedBy: a.string(),
        /** Grant is ignored after this instant (annual PO terms). */
        expiresAt: a.datetime(),
        sortDate: a.datetime().required(),
        organization: a.belongsTo('Organization', 'orgId'),
      })
      .secondaryIndexes((index) => [
        index('orgId')
          .sortKeys(['sortDate'])
          .queryField('entitlementOverridesByOrg'),
      ])
      .authorization((allow) => [
        allow.group('Operator').to(['create', 'read', 'update', 'delete']),
        allow.groups(['Admin', 'Member', 'Viewer']).to(['read']),
      ]),

    /** Webhook idempotency + processing log — written only by the
     *  stripe-webhook handler. */
    StripeWebhookEvent: a
      .model({
        stripeEventId: a.string().required(),
        eventType: a.string().required(),
        stripeCustomerId: a.string(),
        stripeSubscriptionId: a.string(),
        orgId: a.id(),
        status: a.string().required(),
        payload: a.json().required(),
        errorMessage: a.string(),
        processedAt: a.datetime(),
        sortDate: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('stripeEventId').queryField(
          'stripeWebhookEventsByStripeEventId'
        ),
        index('orgId')
          .sortKeys(['sortDate'])
          .queryField('stripeWebhookEventsByOrg'),
        index('eventType')
          .sortKeys(['sortDate'])
          .queryField('stripeWebhookEventsByEventType'),
      ])
      .authorization((allow) => [allow.group('Admin').to(['read'])]),

    // ═══════════════════════════════════════════════════════════════════
    // Custom Types & Mutations
    // ═══════════════════════════════════════════════════════════════════

    CheckoutSessionResponse: a.customType({
      clientSecret: a.string().required(),
    }),

    createCheckoutSession: a
      .mutation()
      .arguments({
        tier: a.ref('SubscriptionTier').required(),
        orgId: a.id().required(),
        /** Add-on module ids to include as extra line items. */
        modules: a.string().array(),
      })
      .returns(a.ref('CheckoutSessionResponse'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(createCheckoutSessionFunction)),

    MediaAccessResponse: a.customType({
      /** False when the media CDN is not in signed mode — fall back to
       *  direct signed S3 URLs. */
      enabled: a.boolean().required(),
      domain: a.string(),
      /** Query-string auth params to append to https://<domain>/<key>. */
      params: a.string(),
      expiresAt: a.datetime(),
    }),

    /** CloudFront signed access to media under one prefix (e.g. one case's
     *  uploads). Authorization: org membership + the vertical's
     *  amplify/data/media-auth.ts seam. See docs/image-delivery.md. */
    getMediaAccess: a
      .query()
      .arguments({
        prefix: a.string().required(),
      })
      .returns(a.ref('MediaAccessResponse'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(getMediaUrlsFunction)),

    AssistRunResult: a.customType({
      eventId: a.id().required(),
      helperId: a.string().required(),
      promptVersion: a.string().required(),
      /** The helper's output, as JSON. */
      output: a.string().required(),
      cached: a.boolean(),
      tokensIn: a.integer(),
      tokensOut: a.integer(),
    }),

    /** Run one Assist helper on one record for the caller. Refused when the
     *  helper is unknown or off, the caller's role may not run it, or the
     *  helper's own access check fails. Returns a suggestion; the screen
     *  shows it light and nothing is written to the record. */
    assistRun: a
      .mutation()
      .arguments({
        helperId: a.string().required(),
        recordType: a.string().required(),
        recordId: a.id().required(),
        targetId: a.id(),
      })
      .returns(a.ref('AssistRunResult'))
      .authorization((allow) => [allow.groups(['Admin', 'Member'])])
      .handler(a.handler.function(assistRunFunction)),

    AssistDecideResult: a.customType({
      eventId: a.id().required(),
      state: a.string().required(),
    }),

    /** The person's decision on a suggestion; the record is written by the
     *  product's own path. */
    assistDecide: a
      .mutation()
      .arguments({
        eventId: a.id().required(),
        state: a.ref('AssistEventState').required(),
        /** What they kept when they edited, as JSON. */
        finalOutput: a.string(),
      })
      .returns(a.ref('AssistDecideResult'))
      .authorization((allow) => [allow.groups(['Admin', 'Member'])])
      .handler(a.handler.function(assistRunFunction)),

    ExportDownload: a.customType({
      /** Presigned, 15 minutes, GET only. */
      url: a.string().required(),
      fileName: a.string().required(),
      expiresAt: a.datetime().required(),
    }),

    /** Ask the record's export provider for its document and queue the
     *  render. Refused before anything is written when the caller may not
     *  export the record, has not affirmed the review, or a suggested
     *  value is unconfirmed. Returns the queued job; poll it until READY. */
    requestExport: a
      .mutation()
      .arguments({
        recordType: a.string().required(),
        recordId: a.id().required(),
        format: a.ref('ExportFormat').required(),
        template: a.string(),
        /** The person's affirmation that they reviewed the document. */
        affirmed: a.boolean().required(),
      })
      .returns(a.ref('ExportJob'))
      .authorization((allow) => [allow.groups(['Admin', 'Member'])])
      .handler(a.handler.function(exportRequestFunction)),

    /** A short-lived download link for a READY job in the caller's org. */
    getExportDownload: a
      .query()
      .arguments({ jobId: a.id().required() })
      .returns(a.ref('ExportDownload'))
      .authorization((allow) => [allow.groups(['Admin', 'Member', 'Viewer'])])
      .handler(a.handler.function(exportRequestFunction)),

    ProvisionOrganizationResponse: a.customType({
      orgId: a.id().required(),
      slug: a.string().required(),
    }),

    /** Onboarding: create the caller's org, link their User, elevate them
     *  to Admin. Idempotent per user. (Named to avoid the auto-generated
     *  createOrganization model mutation.) */
    provisionOrganization: a
      .mutation()
      .arguments({
        name: a.string().required(),
      })
      .returns(a.ref('ProvisionOrganizationResponse'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(createOrganizationFunction)),

    // ═══════════════════════════════════════════════════════════════════
    // Vertical models (per-product, from ./vertical.ts)
    // ═══════════════════════════════════════════════════════════════════
    ...verticalModels,
  })
  .authorization((allow) => [
    allow.resource(eventLoggerFunction).to(['query', 'mutate']),
    allow.resource(organizationTriggerFunction).to(['query', 'mutate']),
    allow.resource(s3FileTriggerFunction).to(['query', 'mutate']),
    allow
      .resource(newsletterSubscriberTriggerFunction)
      .to(['query', 'mutate']),
    allow.resource(sesWebhookHandlerFunction).to(['query', 'mutate']),
    allow.resource(stripeWebhookHandlerFunction).to(['query', 'mutate']),
    allow
      .resource(createCheckoutSessionFunction)
      .to(['query', 'mutate']),
    allow
      .resource(createOrganizationFunction)
      .to(['query', 'mutate']),
    allow.resource(getMediaUrlsFunction).to(['query']),
    allow.resource(exportRequestFunction).to(['query', 'mutate']),
    allow.resource(assistRunFunction).to(['query', 'mutate']),
    // Module command handlers (amplify/data/vertical.ts → verticalFunctions)
    ...Object.values(verticalFunctions).map((fn) =>
      allow.resource(fn).to(['query', 'mutate'])
    ),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
