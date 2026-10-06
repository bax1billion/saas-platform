"use client";

import { useCallback, useState } from "react";
import { getDataClient } from "@/lib/data-client";

/**
 * Run an Assist helper and record the person's decision
 * (docs/spine-services-design.md § 2.3). The suggestion is held here, light,
 * until the product writes it through its own path and calls `decide`.
 * One hook for every helper; the product names the helper, the record and
 * the target.
 */

export type AssistState<O> =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "suggested"; eventId: string; output: O; cached: boolean }
  | { phase: "decided"; eventId: string; state: "ACCEPTED" | "EDITED" | "REJECTED" }
  | { phase: "failed"; message: string };

export function useAssist<O>() {
  const [state, setState] = useState<AssistState<O>>({ phase: "idle" });

  const run = useCallback(async (args: { helperId: string; recordType: string; recordId: string; targetId?: string }) => {
    setState({ phase: "running" });
    const { data, errors } = await getDataClient().mutations.assistRun(args);
    if (errors?.length || !data) {
      setState({ phase: "failed", message: errors?.[0]?.message ?? "Assist could not answer." });
      return;
    }
    let output: O;
    try {
      output = JSON.parse(data.output) as O;
    } catch {
      setState({ phase: "failed", message: "Assist answered in a shape the screen does not understand." });
      return;
    }
    setState({ phase: "suggested", eventId: data.eventId, output, cached: data.cached ?? false });
  }, []);

  const decide = useCallback(async (eventId: string, decision: "ACCEPTED" | "EDITED" | "REJECTED", finalOutput?: unknown) => {
    const { errors } = await getDataClient().mutations.assistDecide({
      eventId,
      state: decision,
      finalOutput: finalOutput === undefined ? undefined : JSON.stringify(finalOutput),
    });
    if (errors?.length) {
      setState({ phase: "failed", message: errors[0].message });
      return false;
    }
    setState({ phase: "decided", eventId, state: decision });
    return true;
  }, []);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, run, decide, reset };
}
