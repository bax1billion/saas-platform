import { describe, expect, it } from 'vitest';
import { decideAssist, parseAssistSettings, usageId } from './settings';

describe('parseAssistSettings', () => {
  it('reads the assist block from a JSON string or an object and ignores junk', () => {
    expect(parseAssistSettings('{"assist":{"enabled":false,"helpers":{"origin.caption":true},"monthlyRunCap":10}}')).toEqual({
      enabled: false,
      helpers: { 'origin.caption': true },
      monthlyRunCap: 10,
    });
    expect(parseAssistSettings({ assist: { monthlyRunCap: -1, enabled: 'yes' } })).toEqual({});
    expect(parseAssistSettings('not json')).toEqual({});
    expect(parseAssistSettings(null)).toEqual({});
  });
});

describe('decideAssist', () => {
  const base = { mode: 'live' as const, settings: {}, helperId: 'origin.caption', helperDefaultOn: true, runsThisMonth: 0, defaultCap: 500 };

  it('lets a shipped-on helper call the model', () => {
    expect(decideAssist(base)).toEqual({ allowed: true, model: true });
  });

  it('honours the environment, the kill switch and the helper switch, in that order', () => {
    expect(decideAssist({ ...base, mode: 'off' }).allowed).toBe(false);
    expect(decideAssist({ ...base, settings: { enabled: false } }).allowed).toBe(false);
    expect(decideAssist({ ...base, settings: { helpers: { 'origin.caption': false } } }).allowed).toBe(false);
    expect(decideAssist({ ...base, helperDefaultOn: false }).allowed).toBe(false);
    expect(decideAssist({ ...base, helperDefaultOn: false, settings: { helpers: { 'origin.caption': true } } }).model).toBe(true);
  });

  it('falls back to rules only at the cap and in rules mode', () => {
    expect(decideAssist({ ...base, runsThisMonth: 500 })).toMatchObject({ allowed: true, model: false });
    expect(decideAssist({ ...base, settings: { monthlyRunCap: 3 }, runsThisMonth: 3 }).model).toBe(false);
    expect(decideAssist({ ...base, settings: { monthlyRunCap: 0 }, runsThisMonth: 9999 }).model).toBe(true);
    expect(decideAssist({ ...base, mode: 'rules' })).toMatchObject({ allowed: true, model: false });
  });

  it('keys usage by org and month', () => {
    expect(usageId('org-1', new Date('2026-10-05T23:59:00Z'))).toBe('org-1#2026-10');
  });
});
