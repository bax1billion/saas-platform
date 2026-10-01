import { describe, expect, it, vi } from 'vitest';
import { setOrgAuthPolicy, type PolicyStore } from './handler';

function store(user: { id: string; orgId: string | null } | null = { id: 'u1', orgId: 'org-a' }) {
  return {
    userBySub: vi.fn(async () => user),
    save: vi.fn(async () => {}),
  } satisfies PolicyStore;
}

const admin = { sub: 's1', username: 'uuid-1', groups: ['Admin'] };
const now = () => '2026-10-01T00:00:00.000Z';

describe('setOrgAuthPolicy', () => {
  it("saves a valid policy to the caller's own org", async () => {
    const s = store();
    const policy = await setOrgAuthPolicy(
      { signInMethods: ['microsoft', 'password'], mfaPolicy: 'REQUIRED' },
      admin,
      'microsoft',
      s,
      now
    );
    expect(policy).toEqual({ signInMethods: ['password', 'microsoft'], mfaPolicy: 'REQUIRED' });
    expect(s.save).toHaveBeenCalledWith('org-a', policy, 'u1', '2026-10-01T00:00:00.000Z');
  });

  it('refuses a non-Admin', async () => {
    const s = store();
    await expect(
      setOrgAuthPolicy({ signInMethods: ['password'], mfaPolicy: 'OFF' }, { ...admin, groups: ['Member'] }, '', s)
    ).rejects.toThrow(/Only an organization Admin/);
    expect(s.save).not.toHaveBeenCalled();
  });

  it('reads groups from the token claims when needed', async () => {
    const s = store();
    await setOrgAuthPolicy(
      { signInMethods: ['password'], mfaPolicy: 'OFF' },
      { sub: 's1', username: 'uuid-1', claims: { 'cognito:groups': ['Admin'] } },
      '',
      s,
      now
    );
    expect(s.save).toHaveBeenCalled();
  });

  it('refuses a caller with no org', async () => {
    await expect(
      setOrgAuthPolicy({ signInMethods: ['password'], mfaPolicy: 'OFF' }, admin, '', store({ id: 'u1', orgId: null }))
    ).rejects.toThrow(/onboarding/);
  });

  it('refuses a method this environment does not offer', async () => {
    const s = store();
    await expect(
      setOrgAuthPolicy({ signInMethods: ['password', 'google'], mfaPolicy: 'OPTIONAL' }, admin, '', s)
    ).rejects.toThrow(/not a sign-in method this environment offers/);
    expect(s.save).not.toHaveBeenCalled();
  });

  it("refuses turning off the Admin's own sign-in method", async () => {
    const s = store();
    await expect(
      setOrgAuthPolicy(
        { signInMethods: ['password'], mfaPolicy: 'OPTIONAL' },
        { ...admin, username: 'Microsoft_abc' },
        'microsoft',
        s
      )
    ).rejects.toThrow(/You signed in with Microsoft/);
  });

  it('refuses an anonymous caller', async () => {
    await expect(setOrgAuthPolicy({}, null, '', store())).rejects.toThrow(/Sign in/);
  });
});
