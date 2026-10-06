import type { Schema } from '../../data/resource';
import Stripe from 'stripe';
import { graphql } from '../../shared/graphql';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICE_MAP: Record<string, string | undefined> = {
  CORE: process.env.STRIPE_PRICE_CORE,
  GROWTH: process.env.STRIPE_PRICE_GROWTH,
  SCALE: process.env.STRIPE_PRICE_SCALE,
};

/**
 * module id → Stripe Price id, from the one STRIPE_MODULE_PRICES secret
 * (see resource.ts). Absent when this environment sells no module.
 */
function parsePrices(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0
      )
    );
  } catch {
    return {};
  }
}
const MODULE_PRICES = parsePrices(process.env.STRIPE_MODULE_PRICES);

/**
 * Module ids checkout may sell in this environment (see
 * amplify/data/sellable.ts). Everything else is a preview: the UI never
 * offers it, and this refusal covers a call that goes around the UI.
 */
const SELLABLE_MODULES = new Set<string>(
  JSON.parse(process.env.SELLABLE_MODULES || '[]')
);

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function modulePriceId(moduleId: string): string {
  if (!SELLABLE_MODULES.has(moduleId)) {
    throw new Error(`Module "${moduleId}" is not for sale yet.`);
  }
  const priceId = MODULE_PRICES[moduleId];
  if (!priceId) {
    throw new Error(
      `Module "${moduleId}" is not purchasable: no price configured.`
    );
  }
  return priceId;
}

export const handler: Schema['createCheckoutSession']['functionHandler'] = async (event) => {
  const { tier, orgId } = event.arguments;
  const moduleIds = (event.arguments.modules ?? []).filter(
    (m): m is string => typeof m === 'string' && m.length > 0
  );

  // Validate tier and get Stripe Price ID
  const priceId = PRICE_MAP[tier];
  if (!priceId) {
    throw new Error(`Invalid tier: ${tier}. No price configured.`);
  }

  // Add-on modules become extra line items on the same subscription. The
  // webhook mirrors them back via each Product's `module=<id>` metadata.
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: priceId, quantity: 1 },
    ...[...new Set(moduleIds)].map((id) => ({
      price: modulePriceId(id),
      quantity: 1,
    })),
  ];

  // Query Organization to get stripeCustomerId
  const orgData = await graphql<{ getOrganization: { id: string; stripeCustomerId: string | null; name: string } }>(
    `query GetOrg($id: ID!) {
      getOrganization(id: $id) {
        id
        stripeCustomerId
        name
      }
    }`,
    { id: orgId },
  );

  const org = orgData.getOrganization;
  if (!org) {
    throw new Error(`Organization not found: ${orgId}`);
  }

  let stripeCustomerId = org.stripeCustomerId;

  // Create Stripe Customer if none exists
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      metadata: { orgId },
    });
    stripeCustomerId = customer.id;

    // Persist stripeCustomerId back to Organization
    await graphql(
      `mutation UpdateOrg($input: UpdateOrganizationInput!) {
        updateOrganization(input: $input) {
          id
          stripeCustomerId
        }
      }`,
      { input: { id: orgId, stripeCustomerId } },
    );
  }

  // Create Stripe Checkout Session in embedded mode
  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items,
    return_url: `${APP_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { orgId, tier, modules: moduleIds.join(',') },
  });

  return { clientSecret: session.client_secret! };
};
