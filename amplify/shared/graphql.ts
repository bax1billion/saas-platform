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

// GRAPHQL_ENDPOINT is set by amplify/backend.ts; AMPLIFY_DATA_GRAPHQL_ENDPOINT
// is Amplify's own SSM-resolved value on schema-granted functions. Resolved
// lazily so the SSM banner has run before we read it.
function endpoint(): string {
  const url =
    process.env.GRAPHQL_ENDPOINT || process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT;
  if (!url) throw new Error('GRAPHQL_ENDPOINT is not configured');
  return url;
}

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
  const graphqlEndpoint = endpoint();
  const url = new URL(graphqlEndpoint);
  const body = JSON.stringify({ query, variables });

  const request = new HttpRequest({
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname,
    headers: {
      'Content-Type': 'application/json',
      host: url.hostname,
    },
    body,
  });

  const signed = await getSigner().sign(request);

  const response = await fetch(graphqlEndpoint, {
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
