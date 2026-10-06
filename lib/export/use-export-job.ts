"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDataClient } from "@/lib/data-client";

/**
 * Request an export, follow the job until the renderer is done, then fetch
 * the download link (docs/spine-services-design.md § 3). One hook for every
 * product: the product only names the record type, the record and the
 * format. The job row is polled because the model has no subscriptions;
 * renders take seconds, so two-second polls for up to five minutes.
 */

export type ExportState =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "rendering"; jobId: string; since: number }
  | { phase: "ready"; jobId: string; url: string; fileName: string }
  | { phase: "failed"; message: string; jobId?: string };

const POLL_MS = 2000;
const GIVE_UP_MS = 5 * 60 * 1000;

export function useExportJob() {
  const [state, setState] = useState<ExportState>({ phase: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setState({ phase: "idle" });
  }, []);

  const start = useCallback(
    async (args: { recordType: string; recordId: string; format: "PDF" | "DOCX"; template?: string; affirmed: boolean }) => {
      const client = getDataClient();
      setState({ phase: "requesting" });
      const { data: job, errors } = await client.mutations.requestExport(args);
      if (errors?.length || !job) {
        setState({ phase: "failed", message: errors?.[0]?.message ?? "The export could not be requested." });
        return;
      }
      const since = Date.now();
      setState({ phase: "rendering", jobId: job.id, since });

      const poll = async () => {
        const { data: current } = await client.models.ExportJob.get({ id: job.id });
        if (current?.status === "READY") {
          const { data: dl, errors: dlErrors } = await client.queries.getExportDownload({ jobId: job.id });
          if (dlErrors?.length || !dl) {
            setState({ phase: "failed", jobId: job.id, message: dlErrors?.[0]?.message ?? "The file is ready but the link could not be made." });
          } else {
            setState({ phase: "ready", jobId: job.id, url: dl.url, fileName: dl.fileName });
          }
          return;
        }
        if (current?.status === "FAILED") {
          setState({ phase: "failed", jobId: job.id, message: current.error ?? "The render failed." });
          return;
        }
        if (Date.now() - since > GIVE_UP_MS) {
          setState({ phase: "failed", jobId: job.id, message: "The render is taking longer than five minutes. Try again later." });
          return;
        }
        timer.current = setTimeout(poll, POLL_MS);
      };
      timer.current = setTimeout(poll, POLL_MS);
    },
    []
  );

  return { state, start, reset };
}
