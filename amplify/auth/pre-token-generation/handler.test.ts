import { describe, expect, it, vi } from 'vitest';
import type { PreTokenGenerationTriggerEvent } from 'aws-lambda';
import { applySignInPolicy, type PolicyLookups } from './handler';

function event(
  userName: string,
  attrs: Record<string, string> = {}
): PreTokenGenerationTriggerEvent {
  return {
    version: '1',
    region: 'us-east-1',
    userPoolId: 'pool-1',
    userName,
    triggerSource: 'TokenGeneration_Authentication',
    callerContext: { awsSdkVersion: '3', clientId: 'client' },
    request: {
      userAttributes: { sub: 'sub-1', ...attrs },
      groupConfiguration: { groupsToOverride: ['Admin'], iamRolesToOverride: [] },
    },
    response: { claimsOverrideDetails: {} },
  } as unknown as PreTokenGenerationTriggerEvent;
}

function lookups(policy: Awaited<ReturnType<PolicyLookups['orgPolicyForSub']>>, totp = false) {
  return {
    orgPolicyForSub: vi.fn(async () => policy),
    totpEnrolled: vi.fn(async () => totp),
  };
}

const GOOGLE_ID = JSON.stringify([{ providerName: 'Google' }]);

describe('applySignInPolicy', () => {
  it('leaves tokens alone for a user with no organization', async () => {
    const l = lookups(null);
    const e = await applySignInPolicy(event('Google_1', { identities: GOOGLE_ID }), 'google', l);
    expect(e.response).toEqual({ claimsOverrideDetails: {} });
  });

  it('allows a method the organization allows', async () => {
    const l = lookups({ signInMethods: ['password', 'google'], mfaPolicy: 'OPTIONAL' });
    const e = await applySignInPolicy(event('Google_1', { identities: GOOGLE_ID }), 'google', l);
    expect(e.response).toEqual({ claimsOverrideDetails: {} });
    expect(l.totpEnrolled).not.toHaveBeenCalled();
  });

  it('refuses a method the organization turned off', async () => {
    const l = lookups({ signInMethods: ['password'], mfaPolicy: 'OPTIONAL' });
    await expect(
      applySignInPolicy(event('Google_1', { identities: GOOGLE_ID }), 'google', l)
    ).rejects.toThrow('Your organization does not allow signing in with Google. Sign in with Email and password.');
  });

  it('refuses password when the organization uses Microsoft only', async () => {
    const l = lookups({ signInMethods: ['microsoft'], mfaPolicy: 'OFF' });
    await expect(applySignInPolicy(event('uuid-user'), 'microsoft', l)).rejects.toThrow(
      /signing in with Email and password/
    );
  });

  it('strips groups and flags setup when two-step is required and missing', async () => {
    const l = lookups({ signInMethods: ['password'], mfaPolicy: 'REQUIRED' }, false);
    const e = await applySignInPolicy(event('uuid-user'), '', l);
    expect(l.totpEnrolled).toHaveBeenCalledWith('pool-1', 'uuid-user');
    expect(e.response.claimsOverrideDetails).toEqual({
      claimsToAddOrOverride: { mfa_setup_required: 'true' },
      groupOverrideDetails: { groupsToOverride: [] },
    });
  });

  it('issues normal tokens once two-step is set up', async () => {
    const l = lookups({ signInMethods: ['password'], mfaPolicy: 'REQUIRED' }, true);
    const e = await applySignInPolicy(event('uuid-user'), '', l);
    expect(e.response).toEqual({ claimsOverrideDetails: {} });
  });

  it('falls back to password when the stored provider is no longer set up', async () => {
    const l = lookups({ signInMethods: ['microsoft'], mfaPolicy: 'OPTIONAL' });
    const e = await applySignInPolicy(event('uuid-user'), '', l);
    expect(e.response).toEqual({ claimsOverrideDetails: {} });
  });

  it('skips the lookup when the event has no sub', async () => {
    const l = lookups({ signInMethods: ['microsoft'], mfaPolicy: 'OFF' });
    const e = event('uuid-user');
    delete (e.request.userAttributes as Record<string, string>).sub;
    await applySignInPolicy(e, '', l);
    expect(l.orgPolicyForSub).not.toHaveBeenCalled();
  });

  it('issues tokens unchanged when the policy lookup fails', async () => {
    const l = {
      orgPolicyForSub: vi.fn(async (): Promise<null> => {
        throw new Error('ResourceNotFound');
      }),
      totpEnrolled: vi.fn(async () => false),
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const e = await applySignInPolicy(event('uuid-user'), '', l);
    expect(e.response).toEqual({ claimsOverrideDetails: {} });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
