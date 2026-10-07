"use client";

import { Amplify } from "aws-amplify";
// Completes a federated (Google / Microsoft) sign-in when the provider
// redirects back with a code, on whichever page that is.
import "aws-amplify/auth/enable-oauth-listener";
import outputs from "@/amplify_outputs.json";
import { ReactNode } from "react";

Amplify.configure(outputs, { ssr: true });

export default function AmplifyProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
