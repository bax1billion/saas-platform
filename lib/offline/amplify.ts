import { conflictFields, looksOffline } from "./queue";
import type { OutboxOp, Row, SendResult } from "./types";

/**
 * Turns an Amplify Data model's create, update and get into an outbox
 * sender. A module passes one typed set of calls per model, so the
 * compiler still checks every field against the schema.
 */
export interface AmplifyCallResult {
  data?: unknown;
  errors?: readonly { message?: string; errorType?: string }[] | null;
}

export interface ModelCalls {
  create(input: Row): Promise<AmplifyCallResult>;
  update(input: Row): Promise<AmplifyCallResult>;
  get(id: string): Promise<AmplifyCallResult>;
}

/** Map an Amplify response's errors to a send result, or null when there were none. */
export function classifyErrors(
  errors: AmplifyCallResult["errors"],
  kind: "create" | "update" | "get"
): Extract<SendResult, { kind: "ok" | "offline" | "rejected" }> | null {
  if (!errors?.length) return null;
  const text = errors.map((e) => `${e.errorType ?? ""} ${e.message ?? ""}`).join("; ");
  if (looksOffline({ message: text })) return { kind: "offline", message: text };
  // A replayed create whose first send reached the server before the
  // signal dropped: the id was minted on the device, so the row is ours.
  // AppSync reports it as DynamoDB:ConditionalCheckFailedException with
  // the message "The conditional request failed"; match either.
  if (kind === "create" && /ConditionalCheckFailed|conditional request failed/i.test(text)) return { kind: "ok" };
  return { kind: "rejected", message: errors[0]?.message || text };
}

export async function sendWithAmplify(op: OutboxOp, calls: ModelCalls): Promise<SendResult> {
  try {
    if (op.kind === "create") {
      const res = await calls.create(op.input);
      return classifyErrors(res.errors, "create") ?? { kind: "ok", row: (res.data as Row) ?? undefined };
    }
    if (op.base && op.baseUpdatedAt) {
      const cur = await calls.get(op.recordId);
      const err = classifyErrors(cur.errors, "get");
      if (err) return err;
      const server = cur.data as Row | null | undefined;
      if (!server) return { kind: "rejected", message: "This record is no longer on the server" };
      const fields = conflictFields(op, server);
      if (fields.length) return { kind: "conflict", serverRow: server, fields };
    }
    const res = await calls.update(op.input);
    return classifyErrors(res.errors, "update") ?? { kind: "ok", row: (res.data as Row) ?? undefined };
  } catch (err) {
    if (looksOffline(err)) return { kind: "offline", message: err instanceof Error ? err.message : String(err) };
    return { kind: "rejected", message: err instanceof Error ? err.message : String(err) };
  }
}
