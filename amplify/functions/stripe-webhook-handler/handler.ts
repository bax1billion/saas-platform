import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const signature = event.headers['stripe-signature'];
  const body = event.body;

  if (!signature || !body) {
    return { statusCode: 400, body: 'Missing signature or body' };
  }

  // TODO: Verify webhook signature using Stripe SDK:
  //   const stripeEvent = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);

  // TODO: Idempotency check — query StripeWebhookEvent.byStripeEventId
  //   If exists with status PROCESSED → return 200 (skip)

  // TODO: Create StripeWebhookEvent record (status: RECEIVED, payload: full event JSON)

  // TODO: Route by event type:
  //   checkout.session.completed → create OrgSubscription, set Organization.stripeCustomerId
  //   customer.subscription.created → create/update OrgSubscription
  //   customer.subscription.updated → update OrgSubscription (status, tier, period dates)
  //   For every subscription event, mirror line items onto the record:
  //     tier    ← the item whose Product metadata has `tier=<CORE|GROWTH|SCALE>`
  //     modules ← [Product metadata `module=<id>`] for every other item
  //   (docs/modules.md — never trust the Checkout metadata for this; the
  //    subscription's current items are the truth after any later change)
  //   customer.subscription.deleted → update OrgSubscription: status → CANCELED, endedAt
  //   invoice.payment_succeeded → update OrgSubscription: latestInvoiceStatus → paid
  //   invoice.payment_failed → update OrgSubscription: status → PAST_DUE

  // TODO: Update StripeWebhookEvent: status → PROCESSED, processedAt = now

  console.log('StripeWebhookHandler: Received event', { type: 'unknown', signature: signature.slice(0, 20) });

  return { statusCode: 200, body: 'OK' };
};
