// The Amplify Hosting deploy event, mapped to what GitHub receives
// (docs/pull-request-gates.md § 6). Pure: handler.mjs reads the event,
// looks the job up, and sends what this returns as a repository_dispatch.
//
// The EventBridge event ("Amplify Deployment Status Change", source
// aws.amplify) carries the app, the branch, the job and its status, but not
// the commit; the job summary from amplify:GetJob has it.

/** The statuses the workflow understands; anything else reads as in progress. */
export const TERMINAL = new Set(["SUCCEED", "FAILED", "CANCELLED"]);

/** The Amplify console page for one job, so the status links straight to the log. */
export function consoleUrl({ region, appId, branch, jobId }) {
  return `https://${region}.console.aws.amazon.com/amplify/apps/${appId}/branches/${encodeURIComponent(branch)}/deployments/${jobId}`;
}

/**
 * @param {{ region?: string, detail?: { appId?: string, branchName?: string, jobId?: string, jobStatus?: string } }} event
 * @param {{ commitId?: string } | null} job the job summary, when it could be read
 */
export function payloadFor(event, job) {
  const d = event.detail ?? {};
  const region = event.region ?? process.env.AWS_REGION ?? "us-east-1";
  const branch = d.branchName ?? "";
  const status = String(d.jobStatus ?? "").toUpperCase();
  return {
    appId: d.appId ?? "",
    region,
    branch,
    jobId: String(d.jobId ?? ""),
    status,
    terminal: TERMINAL.has(status),
    commitId: job?.commitId && job.commitId !== "HEAD" ? job.commitId : "",
    consoleUrl: consoleUrl({ region, appId: d.appId ?? "", branch, jobId: d.jobId ?? "" }),
  };
}

/** Whether this event is worth sending: a branch we track, in a state the workflow records. */
export function shouldSend(payload, branches = ["main"]) {
  return branches.includes(payload.branch) && (payload.terminal || payload.status === "STARTED" || payload.status === "RUNNING");
}
