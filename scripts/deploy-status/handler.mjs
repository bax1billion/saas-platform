// Lambda: Amplify Hosting deploy events into GitHub (docs/pull-request-gates.md § 6).
//
// Lives in each hosting account (one per branch it builds), outside the Amplify
// backend on purpose: it must report the deploys that fail. EventBridge
// rule pattern: { "source": ["aws.amplify"], "detail-type": ["Amplify Deployment Status Change"] }.
// Runtime Node 22; the AWS SDK v3 ships with the runtime, nothing to bundle.
//
// Environment:
//   GITHUB_REPOSITORY   owner/repo of the repository the workflow lives in
//   GITHUB_TOKEN        a fine-grained token on that one repository with
//                       "Contents: read and write" (repository_dispatch needs it);
//                       stored in Secrets Manager and read at cold start, or set
//                       directly on the function
//   GITHUB_TOKEN_SECRET_ARN  the Secrets Manager secret holding it (optional)
//   TRACKED_BRANCHES    comma separated, default "main"
import { AmplifyClient, GetJobCommand } from "@aws-sdk/client-amplify";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { payloadFor, shouldSend } from "./payload.mjs";

let token;

async function githubToken() {
  if (token) return token;
  if (process.env.GITHUB_TOKEN) return (token = process.env.GITHUB_TOKEN);
  const arn = process.env.GITHUB_TOKEN_SECRET_ARN;
  if (!arn) throw new Error("GITHUB_TOKEN or GITHUB_TOKEN_SECRET_ARN must be set");
  const out = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: arn }));
  return (token = out.SecretString);
}

async function jobSummary(detail) {
  try {
    const out = await new AmplifyClient({}).send(new GetJobCommand({ appId: detail.appId, branchName: detail.branchName, jobId: String(detail.jobId) }));
    return { commitId: out.job?.summary?.commitId };
  } catch (err) {
    console.log(JSON.stringify({ level: "warn", msg: "GetJob failed; sending without the commit", error: String(err) }));
    return null;
  }
}

export async function handler(event) {
  const payload = payloadFor(event, await jobSummary(event.detail ?? {}));
  const branches = (process.env.TRACKED_BRANCHES ?? "main").split(",").map((s) => s.trim()).filter(Boolean);
  if (!shouldSend(payload, branches)) {
    console.log(JSON.stringify({ level: "info", msg: "skipped", branch: payload.branch, status: payload.status }));
    return { sent: false };
  }
  const repo = process.env.GITHUB_REPOSITORY;
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${await githubToken()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "amplify-deploy-status",
    },
    body: JSON.stringify({ event_type: "amplify-deploy", client_payload: payload }),
  });
  if (!res.ok) throw new Error(`repository_dispatch failed: ${res.status} ${await res.text()}`);
  console.log(JSON.stringify({ level: "info", msg: "sent", branch: payload.branch, status: payload.status, jobId: payload.jobId, commitId: payload.commitId }));
  return { sent: true };
}
