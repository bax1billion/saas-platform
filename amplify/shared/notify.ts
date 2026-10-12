/**
 * The outbound notification seam: one `dispatch()` every module sends
 * through, so a provider adapter (an email service for EMAIL, a telephony
 * provider for SMS and VOICE, a push service for PUSH) is wired once and
 * every caller gets it. A module records its own delivery rows; this
 * decides only whether the leg went out.
 *
 * Modes:
 *  - `log` simulates: the leg is logged as sent and NOTHING reaches a
 *    person. A sandbox-only mode, so a flow can run end to end before a
 *    provider exists. amplify/backend.ts refuses it on a deployed branch.
 *  - `none` (the default when no mode is set): every leg fails with
 *    NO_PROVIDER_CONFIGURED, recorded, never silently dropped.
 *  - A provider mode lands here as a new branch behind the same signature.
 */

export type NotifyChannel = 'PUSH' | 'SMS' | 'VOICE' | 'EMAIL' | 'MANUAL';

/** The mode a function was deployed with. Unset reads as `none`: a
 *  function nobody configured must not pretend to have sent anything. */
export const notifyModeFromEnv = (env: Record<string, string | undefined> = process.env) =>
  env.NOTIFY_MODE ?? 'none';

/**
 * Send one leg. Resolves to `null` when it went out, otherwise the failure
 * reason. Async because a real adapter is an awaited call.
 */
export async function dispatch(args: {
  mode: string;
  channel: NotifyChannel;
  /** The caller's purpose code, for the log ("OFFER", "ACTIVATION"). */
  purpose: string;
  /** Who it is for and what it is about: ids only, never message text. */
  recipientId: string;
  refId: string;
  critical: boolean;
}): Promise<string | null> {
  const { mode, ...leg } = args;
  console.log('notify: leg', { mode, simulated: mode === 'log', ...leg });
  return mode === 'log' ? null : 'NO_PROVIDER_CONFIGURED';
}
