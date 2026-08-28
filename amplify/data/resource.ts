import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { eventLoggerFunction } from '../functions/event-logger/resource';
import { organizationTriggerFunction } from '../functions/organization-trigger/resource';
import { s3FileTriggerFunction } from '../functions/s3-file-trigger/resource';
import { newsletterSubscriberTriggerFunction } from '../functions/newsletter-subscriber-trigger/resource';
import { sesWebhookHandlerFunction } from '../functions/ses-webhook-handler/resource';
import { stripeWebhookHandlerFunction } from '../functions/stripe-webhook-handler/resource';
import { createCheckoutSessionFunction } from '../functions/create-checkout-session/resource';
import { createOrganizationFunction } from '../functions/create-organization/resource';
import {
  verticalModels,
  verticalEntityTypes,
  verticalEventActions,
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
