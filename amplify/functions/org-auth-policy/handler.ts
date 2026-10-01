import type { Schema } from '../../data/resource';
import { graphql } from '../../shared/graphql';
import { ADMIN } from '../../shared/constants';
import {
  configuredMethodsFromEnv,
  signInMethodFor,
  validateAuthPolicy,
  type AuthPolicy,
} from '../../shared/auth-policy';

type Identity = {
  sub?: string;
  username?: string;
  groups?: string[] | null;
  claims?: Record<string, unknown>;
} | null | undefined;

export type PolicyStore = {
  /** The caller's User row (id and org), or null. */
  userBySub(sub: string): Promise<{ id: string; orgId: string | null } | null>;
  save(orgId: string, policy: AuthPolicy, updatedBy: string, at: string): Promise<void>;
};

/**
 * The command, separated from AppSync for tests. The caller's org comes
 * from their own User row, never from the request, so an Admin can only
 * change the org they belong to.
 */
export async function setOrgAuthPolicy(
  args: { signInMethods?: unknown; mfaPolicy?: unknown },
  identity: Identity,
  configuredValue: string | undefined,
  store: PolicyStore,
  now: () => string = () => new Date().toISOString()
): Promise<AuthPolicy> {
  const sub = identity?.sub;
  if (!sub) throw new Error('Sign in to change sign-in settings.');
  const groups =
    identity?.groups ??
    ((identity?.claims?.['cognito:groups'] as string[] | undefined) ?? []);
  if (!groups.includes(ADMIN)) {
    throw new Error('Only an organization Admin can change sign-in settings.');
  }

  const user = await store.userBySub(sub);
  if (!user?.orgId) throw new Error('Complete onboarding before changing sign-in settings.');

  const configured = configuredMethodsFromEnv(configuredValue);
  const callerMethod = signInMethodFor(
    identity?.username,
    null,
    configured.filter((m) => m !== 'password')
  );
  const result = validateAuthPolicy(args, configured, callerMethod);
  if (!result.ok) throw new Error(result.errors.join(' '));

  await store.save(user.orgId, result.policy, user.id, now());
  return result.policy;
}

const appsyncStore: PolicyStore = {
  async userBySub(sub) {
    const res = await graphql<{
      usersByCognitoSub: { items: Array<{ id: string; orgId: string | null }> };
    }>(
      `query ByCognitoSub($sub: String!) {
        usersByCognitoSub(cognitoSub: $sub, limit: 1) { items { id orgId } }
      }`,
      { sub }
    );
    return res.usersByCognitoSub.items[0] ?? null;
  },
  async save(orgId, policy, updatedBy, at) {
    await graphql(
      `mutation SetPolicy($input: UpdateOrganizationInput!) {
        updateOrganization(input: $input) { id }
      }`,
      {
        input: {
          id: orgId,
          signInMethods: policy.signInMethods,
          mfaPolicy: policy.mfaPolicy,
          authPolicyUpdatedAt: at,
          authPolicyUpdatedBy: updatedBy,
        },
      }
    );
  },
};

export const handler: Schema['setOrgAuthPolicy']['functionHandler'] = async (event) =>
  setOrgAuthPolicy(
    event.arguments,
    event.identity as Identity,
    process.env.AUTH_FEDERATED_PROVIDERS,
    appsyncStore
  );
