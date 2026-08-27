import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

/**
 * IAM (SigV4) signed AppSync GraphQL client for Lambdas — the "call back
 * into AppSync" half of the stored-procedure pattern (docs/core-data-model.md
 * §1). Requires the function to be granted on the schema via
 * `allow.resource(fn)` and to have GRAPHQL_ENDPOINT in its environment
 * (set for every function in allTriggerFunctions by amplify/backend.ts).
 */

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT!;

let signer: SignatureV4 | undefined;

function getSigner(): SignatureV4 {
  if (!signer) {
    signer = new SignatureV4({
      credentials: defaultProvider(),
      region: process.env.AWS_REGION!,
      service: 'appsync',
      sha256: Sha256,
    });
  }
  return signer;
}

export async function graphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const endpoint = new URL(GRAPHQL_ENDPOINT);
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

  const signed = await getSigner().sign(request);

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: signed.headers,
    body,
  });

  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return json.data as T;
}
