import type { Schema } from '../../data/resource';
import Stripe from 'stripe';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICE_MAP: Record<string, string | undefined> = {
  CORE: process.env.STRIPE_PRICE_CORE,
  GROWTH: process.env.STRIPE_PRICE_GROWTH,
  SCALE: process.env.STRIPE_PRICE_SCALE,
};

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT!;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── AppSync GraphQL helper ────────────────────────────────────────

const endpoint = new URL(GRAPHQL_ENDPOINT);

const signer = new SignatureV4({
  credentials: defaultProvider(),
  region: process.env.AWS_REGION!,
  service: 'appsync',
  sha256: Sha256,
});

async function graphql<T = any>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const body = JSON.stringify({ query, variables });

  const request = new HttpRequest({
    method: 'POST',
    hostname: endpoint.hostname,
    path: endpoint.pathname,
    headers: {
      'Content-Type': 'application/json',
      host: endpoint.hostname,
    },
    body,
  });

  const signed = await signer.sign(request);

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: signed.headers,
    body,
  });

  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return json.data;
}

// ─── Handler ───────────────────────────────────────────────────────

export const handler: Schema['createCheckoutSession']['functionHandler'] = async (event) => {
  const { tier, orgId } = event.arguments;

  // Validate tier and get Stripe Price ID
  const priceId = PRICE_MAP[tier];
  if (!priceId) {
    throw new Error(`Invalid tier: ${tier}. No price configured.`);
  }

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
    line_items: [{ price: priceId, quantity: 1 }],
    return_url: `${APP_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { orgId, tier },
  });

  return { clientSecret: session.client_secret! };
};
