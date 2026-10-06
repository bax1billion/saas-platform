/**
 * Assist switches and caps, resolved from Organization.settings (pure).
 *
 *   settings.assist = {
 *     enabled?: boolean,                      // the kill switch for all of Assist
 *     helpers?: { [helperId]: boolean },      // per-helper switch
 *     monthlyRunCap?: number,                 // hard cap; over it, rules only
 *   }
 *
 * Precedence: the environment's ASSIST_MODE (off | rules | live) beats
 * everything; then the agency's kill switch; then the helper's switch,
 * falling back to the helper's shipped default. The Settings Library
 * replaces this JSON later; the shape is what it will read.
 */

export type AssistMode = 'off' | 'rules' | 'live';

export interface AssistSettings {
  enabled?: boolean;
  helpers?: Record<string, boolean>;
  monthlyRunCap?: number;
}

export interface AssistDecision {
  /** May the helper run at all (rules or model)? */
  allowed: boolean;
  /** May it call the model? False means rules only. */
  model: boolean;
  reason?: string;
}

export function parseAssistSettings(orgSettings: unknown): AssistSettings {
  const raw = typeof orgSettings === 'string' ? safeJson(orgSettings) : orgSettings;
  const a = (raw as { assist?: unknown } | null)?.assist;
  if (!a || typeof a !== 'object') return {};
  const s = a as AssistSettings;
  return {
    ...(typeof s.enabled === 'boolean' ? { enabled: s.enabled } : {}),
    ...(s.helpers && typeof s.helpers === 'object' ? { helpers: s.helpers } : {}),
    ...(typeof s.monthlyRunCap === 'number' && s.monthlyRunCap >= 0 ? { monthlyRunCap: s.monthlyRunCap } : {}),
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function decideAssist(args: {
  mode: AssistMode;
  settings: AssistSettings;
  helperId: string;
  helperDefaultOn: boolean;
  runsThisMonth: number;
  defaultCap: number;
}): AssistDecision {
  if (args.mode === 'off') return { allowed: false, model: false, reason: 'Assist is off in this environment.' };
  if (args.settings.enabled === false) return { allowed: false, model: false, reason: 'Assist is switched off for this agency.' };
  const on = args.settings.helpers?.[args.helperId] ?? args.helperDefaultOn;
  if (!on) return { allowed: false, model: false, reason: 'This helper is switched off for this agency.' };
  const cap = args.settings.monthlyRunCap ?? args.defaultCap;
  if (args.mode === 'rules') return { allowed: true, model: false, reason: 'Assist runs rules only in this environment.' };
  if (cap > 0 && args.runsThisMonth >= cap) {
    return { allowed: true, model: false, reason: `This agency reached its monthly Assist cap (${cap} runs). Rules only until next month.` };
  }
  return { allowed: true, model: true };
}

/** The usage row id for an org in a month: `<orgId>#<yyyy-mm>`. */
export function usageId(orgId: string, at: Date): string {
  return `${orgId}#${at.toISOString().slice(0, 7)}`;
}
