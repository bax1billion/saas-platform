import { describe, expect, it } from 'vitest';
import { dispatch, notifyModeFromEnv } from './notify';

const leg = { channel: 'SMS' as const, purpose: 'TEST', recipientId: 'r1', refId: 'x1', critical: false };

describe('notification seam', () => {
  it('reads an unset mode as none: an unconfigured function never pretends to send', () => {
    expect(notifyModeFromEnv({})).toBe('none');
    expect(notifyModeFromEnv({ NOTIFY_MODE: 'log' })).toBe('log');
  });

  it('log simulates a send; none records the missing provider', async () => {
    expect(await dispatch({ mode: 'log', ...leg })).toBeNull();
    expect(await dispatch({ mode: 'none', ...leg })).toBe('NO_PROVIDER_CONFIGURED');
    expect(await dispatch({ mode: 'something-else', ...leg })).toBe('NO_PROVIDER_CONFIGURED');
  });
});
