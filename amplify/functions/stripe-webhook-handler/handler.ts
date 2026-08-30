import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import Stripe from 'stripe';
import { graphql } from '../../shared/graphql';

/**
 * Stripe webhook → OrgSubscription mirror (docs/subscriptions-and-payments.md
 * §Stripe Integration, docs/core-data-model.md §2.6).
 *
 * Delivery: Lambda Function URL (backend.ts §5). Signature-verified,
 * idempotent via StripeWebhookEvent, and convergent: every handled event
 * ends by re-reading the subscription from Stripe and upserting the mirror,
 * so out-of-order or duplicate deliveries can't leave stale state.
 *
 * `processEvent()` takes a verified Stripe.Event and has no HTTP knowledge,
 * so an EventBridge target could reuse it with a small adapter.
 *
 * Subscribed events (configure exactly these in the Stripe Dashboard):
 *   checkout.session.completed
 *   customer.subscription.created / updated / deleted
 *   invoice.payment_succeeded (or invoice.paid) / invoice.payment_failed
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

const HANDLED_EVENTS = new Set<string>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
]);

// ─── Types mirrored from the schema ────────────────────────────────

type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'UNPAID'
  | 'CANCELED'
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'PAUSED';

type WebhookEventRecord = {
  id: string;
  status: string;
};

type OrgSubscriptionRecord = {
  id: string;
  orgId: string;
};

type OrgSubscriptionInput = {
  orgId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  stripeProductId?: string;
  tier: string;
  status: SubscriptionStatus;
  modules: string[];
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  trialStart?: string;
  trialEnd?: string;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string;
  endedAt?: string;
  latestInvoiceId?: string;
  latestInvoiceStatus?: string;
  latestInvoiceUrl?: string;
  metadata?: string;
};

type InvoicePatch = Pick<
  OrgSubscriptionInput,
  'latestInvoiceId' | 'latestInvoiceStatus' | 'latestInvoiceUrl'
>;

type RouteResult = {
  orgId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** Set when the event was valid but not applicable (returns 200). */
  skipped?: string;
};

// ─── Small helpers ─────────────────────────────────────────────────

const iso = (unixSeconds: number | null | undefined) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : undefined;

const idOf = (ref: string | { id: string } | null | undefined) =>
  typeof ref === 'string' ? ref : ref?.id;

// ─── Data access (SigV4 AppSync) ───────────────────────────────────

async function findWebhookEvent(
  stripeEventId: string
): Promise<WebhookEventRecord | undefined> {
  const res = await graphql<{
    stripeWebhookEventsByStripeEventId: { items: WebhookEventRecord[] };
  }>(
    `query ByEventId($id: String!) {
      stripeWebhookEventsByStripeEventId(stripeEventId: $id, limit: 1) { items { id status } }
    }`,
    { id: stripeEventId }
  );
  return res.stripeWebhookEventsByStripeEventId.items[0];
}

async function createWebhookEvent(event: Stripe.Event): Promise<WebhookEventRecord> {
  const obj = event.data.object as { customer?: unknown; subscription?: unknown };
  const res = await graphql<{ createStripeWebhookEvent: WebhookEventRecord }>(
    `mutation Create($input: CreateStripeWebhookEventInput!) {
      createStripeWebhookEvent(input: $input) { id status }
    }`,
    {
      input: {
        stripeEventId: event.id,
        eventType: event.type,
        stripeCustomerId: idOf(obj.customer as string | { id: string } | null),
        stripeSubscriptionId: idOf(obj.subscription as string | { id: string } | null),
        status: 'RECEIVED',
        payload: JSON.stringify(event),
        sortDate: new Date().toISOString(),
      },
    }
  );
  return res.createStripeWebhookEvent;
}

async function updateWebhookEvent(
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  await graphql(
    `mutation Update($input: UpdateStripeWebhookEventInput!) {
      updateStripeWebhookEvent(input: $input) { id }
    }`,
    { input: { id, ...patch } }
  );
}

async function findOrgSubscription(
  stripeSubscriptionId: string
): Promise<OrgSubscriptionRecord | undefined> {
  const res = await graphql<{
    subscriptionsByStripeSubscriptionId: { items: OrgSubscriptionRecord[] };
  }>(
    `query BySub($id: String!) {
      subscriptionsByStripeSubscriptionId(stripeSubscriptionId: $id, limit: 1) { items { id orgId } }
    }`,
    { id: stripeSubscriptionId }
  );
  return res.subscriptionsByStripeSubscriptionId.items[0];
}

async function findOrgByCustomer(
  stripeCustomerId: string
): Promise<{ id: string } | undefined> {
  const res = await graphql<{
    organizationsByStripeCustomerId: { items: Array<{ id: string }> };
  }>(
    `query ByCustomer($id: String!) {
      organizationsByStripeCustomerId(stripeCustomerId: $id, limit: 1) { items { id } }
    }`,
    { id: stripeCustomerId }
  );
  return res.organizationsByStripeCustomerId.items[0];
}

async function getOrg(
  id: string
): Promise<{ id: string; stripeCustomerId: string | null } | null> {
  const res = await graphql<{
    getOrganization: { id: string; stripeCustomerId: string | null } | null;
  }>(`query GetOrg($id: ID!) { getOrganization(id: $id) { id stripeCustomerId } }`, {
    id,
  });
  return res.getOrganization;
}

async function setOrgCustomer(orgId: string, stripeCustomerId: string): Promise<void> {
  await graphql(
    `mutation UpdateOrg($input: UpdateOrganizationInput!) {
      updateOrganization(input: $input) { id }
    }`,
    { input: { id: orgId, stripeCustomerId } }
  );
}

async function upsertOrgSubscription(
  existing: OrgSubscriptionRecord | undefined,
  input: OrgSubscriptionInput
): Promise<void> {
  if (existing) {
    await graphql(
      `mutation Update($input: UpdateOrgSubscriptionInput!) {
        updateOrgSubscription(input: $input) { id }
      }`,
      { input: { id: existing.id, ...input } }
    );
  } else {
    await graphql(
      `mutation Create($input: CreateOrgSubscriptionInput!) {
        createOrgSubscription(input: $input) { id }
      }`,
      { input: { ...input, sortDate: new Date().toISOString() } }
    );
  }
}

// ─── Core: mirror one subscription from Stripe ─────────────────────

/**
 * Re-read the subscription (with product metadata expanded) and upsert the
 * OrgSubscription mirror. Tier comes from the line item whose Product has
 * metadata `tier=<CORE|GROWTH|SCALE>`; add-on modules from items whose
 * Product has metadata `module=<id>` (docs/modules.md).
 */
async function syncSubscription(
  stripeSubscriptionId: string,
  orgIdHint: string | undefined,
  invoicePatch?: InvoicePatch
): Promise<RouteResult> {
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ['items.data.price.product'],
  });
  const stripeCustomerId = idOf(sub.customer)!;

  // Resolve the tenant: existing mirror → customer GSI → metadata hint
  const existing = await findOrgSubscription(sub.id);
  const orgId =
    existing?.orgId ??
    (await findOrgByCustomer(stripeCustomerId))?.id ??
    orgIdHint ??
    sub.metadata?.orgId;

  if (!orgId) {
    return {
      stripeCustomerId,
      stripeSubscriptionId: sub.id,
      skipped: `No Organization for Stripe customer ${stripeCustomerId}`,
    };
  }

  // Line items → tier + modules
  let tierItem: Stripe.SubscriptionItem | undefined;
  let tier: string | undefined;
  const modules: string[] = [];
  for (const item of sub.items.data) {
    const product = item.price.product as Stripe.Product | Stripe.DeletedProduct | string;
    const meta = typeof product === 'object' && 'metadata' in product ? product.metadata : {};
    if (meta.tier && !tierItem) {
      tierItem = item;
      tier = meta.tier.toUpperCase();
    } else if (meta.module) {
      modules.push(meta.module);
    }
  }
  if (!tierItem || !tier) {
    throw new Error(
      `Subscription ${sub.id} has no line item whose Product metadata sets tier=<CORE|GROWTH|SCALE>`
    );
  }

  const input: OrgSubscriptionInput = {
    orgId,
    stripeSubscriptionId: sub.id,
    stripeCustomerId,
    stripePriceId: tierItem.price.id,
    stripeProductId: idOf(tierItem.price.product as string | { id: string }),
    tier,
    status: sub.status.toUpperCase() as SubscriptionStatus,
    modules: [...new Set(modules)].sort(),
    currentPeriodStart: iso(tierItem.current_period_start),
    currentPeriodEnd: iso(tierItem.current_period_end),
    trialStart: iso(sub.trial_start),
    trialEnd: iso(sub.trial_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: iso(sub.canceled_at),
    endedAt: iso(sub.ended_at),
    metadata: JSON.stringify(sub.metadata ?? {}),
    ...(invoicePatch ?? {}),
  };

  await upsertOrgSubscription(existing, input);

  // Keep Organization.stripeCustomerId in sync (first checkout, or a
  // customer created outside createCheckoutSession).
  const org = await getOrg(orgId);
  if (org && org.stripeCustomerId !== stripeCustomerId) {
    await setOrgCustomer(orgId, stripeCustomerId);
  }

  return { orgId, stripeCustomerId, stripeSubscriptionId: sub.id };
}

// ─── Routing ───────────────────────────────────────────────────────

async function route(event: Stripe.Event): Promise<RouteResult> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription') {
        return { skipped: `Checkout mode ${session.mode} is not a subscription` };
      }
      const subId = idOf(session.subscription);
      if (!subId) return { skipped: 'Checkout session has no subscription' };
      return syncSubscription(subId, session.metadata?.orgId ?? undefined);
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      return syncSubscription(sub.id, sub.metadata?.orgId ?? undefined);
    }

    case 'invoice.paid':
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subId = idOf(invoice.parent?.subscription_details?.subscription);
      if (!subId) return { skipped: 'Invoice is not tied to a subscription' };
      return syncSubscription(subId, undefined, {
        latestInvoiceId: invoice.id,
        latestInvoiceStatus: invoice.status ?? undefined,
        latestInvoiceUrl: invoice.hosted_invoice_url ?? undefined,
      });
    }

    default:
      return { skipped: `Unhandled event type ${event.type}` };
  }
}

// ─── Entry points ──────────────────────────────────────────────────

/** Verified-event processor: idempotent, records every delivery. */
export async function processEvent(
  event: Stripe.Event
): Promise<{ statusCode: number; body: string }> {
  if (!HANDLED_EVENTS.has(event.type)) {
    return { statusCode: 200, body: `Ignored ${event.type}` };
  }

  const existing = await findWebhookEvent(event.id);
  if (existing && (existing.status === 'PROCESSED' || existing.status === 'SKIPPED')) {
    return { statusCode: 200, body: `Already ${existing.status.toLowerCase()}` };
  }
  const record = existing ?? (await createWebhookEvent(event));

  try {
    const result = await route(event);
    await updateWebhookEvent(record.id, {
      status: result.skipped ? 'SKIPPED' : 'PROCESSED',
      processedAt: new Date().toISOString(),
      orgId: result.orgId,
      stripeCustomerId: result.stripeCustomerId,
      stripeSubscriptionId: result.stripeSubscriptionId,
      errorMessage: result.skipped,
    });
    console.log('StripeWebhook: processed', {
      id: event.id,
      type: event.type,
      ...result,
    });
    return { statusCode: 200, body: result.skipped ? 'Skipped' : 'OK' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('StripeWebhook: failed', { id: event.id, type: event.type, message });
    await updateWebhookEvent(record.id, { status: 'FAILED', errorMessage: message });
    // Non-2xx → Stripe retries with backoff; FAILED records may be retried.
    return { statusCode: 500, body: 'Processing failed' };
  }
}

/** Lambda Function URL entry point: verify the signature, then process. */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const signature = event.headers['stripe-signature'];
  if (!signature || !event.body) {
    return { statusCode: 400, body: 'Missing signature or body' };
  }

  // Signature verification needs the exact raw bytes Stripe sent.
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.warn('StripeWebhook: signature verification failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return { statusCode: 400, body: 'Invalid signature' };
  }

  try {
    return await processEvent(stripeEvent);
  } catch (err) {
    // Failure before the delivery could be recorded (e.g. AppSync unreachable).
    // 500 → Stripe retries; nothing was persisted, so the retry starts clean.
    console.error('StripeWebhook: unrecoverable', {
      id: stripeEvent.id,
      type: stripeEvent.type,
      message: err instanceof Error ? err.message : String(err),
    });
    return { statusCode: 500, body: 'Processing failed' };
  }
};
