"use client";

import { Amplify } from "aws-amplify";
import outputs from "@/amplify_outputs.json";
import { ReactNode } from "react";

Amplify.configure(outputs, { ssr: true });

export default function AmplifyProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
