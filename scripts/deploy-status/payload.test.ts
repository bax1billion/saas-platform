import { describe, expect, it } from "vitest";
import { consoleUrl, payloadFor, shouldSend } from "./payload.mjs";

const event = {
  region: "us-east-2",
  detail: { appId: "d1abc", branchName: "main", jobId: "42", jobStatus: "SUCCEED" },
};

describe("deploy status payload", () => {
  it("maps the Amplify event and the job's commit", () => {
    const p = payloadFor(event, { commitId: "6df12a01" });
    expect(p).toMatchObject({ appId: "d1abc", region: "us-east-2", branch: "main", jobId: "42", status: "SUCCEED", terminal: true, commitId: "6df12a01" });
    expect(p.consoleUrl).toBe("https://us-east-2.console.aws.amazon.com/amplify/apps/d1abc/branches/main/deployments/42");
  });

  it("leaves the commit empty when the job is unknown or says HEAD", () => {
    expect(payloadFor(event, null).commitId).toBe("");
    expect(payloadFor(event, { commitId: "HEAD" }).commitId).toBe("");
  });

  it("knows which statuses end a job", () => {
    expect(payloadFor({ ...event, detail: { ...event.detail, jobStatus: "FAILED" } }, null).terminal).toBe(true);
    expect(payloadFor({ ...event, detail: { ...event.detail, jobStatus: "RUNNING" } }, null).terminal).toBe(false);
  });

  it("sends only the tracked branches, started or finished", () => {
    expect(shouldSend(payloadFor(event, null))).toBe(true);
    expect(shouldSend(payloadFor({ ...event, detail: { ...event.detail, branchName: "ba-1234-thing" } }, null))).toBe(false);
    expect(shouldSend(payloadFor({ ...event, detail: { ...event.detail, jobStatus: "PROVISIONING" } }, null))).toBe(false);
    expect(shouldSend(payloadFor({ ...event, detail: { ...event.detail, branchName: "main", jobStatus: "STARTED" } }, null))).toBe(true);
  });

  it("escapes a branch name in the console link", () => {
    expect(consoleUrl({ region: "us-east-2", appId: "a", branch: "fix/x", jobId: "1" })).toContain("/branches/fix%2Fx/");
  });
});
