"use client";

import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

let client: ReturnType<typeof generateClient<Schema>> | undefined;

/**
 * Shared, lazily created Amplify Data client for client components.
 * Amplify.configure() runs in AmplifyProvider at module scope, so by the
 * time any component calls this the configuration is in place.
 */
export function getDataClient() {
  if (!client) client = generateClient<Schema>();
  return client;
}

export type { Schema };
