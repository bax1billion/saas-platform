import type { Schema } from '../../data/resource';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { graphql } from '../../shared/graphql';
import { ADMIN } from '../../shared/constants';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID!;

type UserRecord = { id: string; orgId: string | null; email: string };

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'org'
  );
}

async function findFreeSlug(base: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const res = await graphql<{
      organizationsBySlug: { items: Array<{ id: string }> };
    }>(
      `query BySlug($slug: String!) {
        organizationsBySlug(slug: $slug, limit: 1) { items { id } }
      }`,
      { slug: candidate }
    );
    if (res.organizationsBySlug.items.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Onboarding step 1: the signed-in user creates their organization.
 *
 * Runs with IAM (schema-level grant) so it can write Organization and User
 * even though the caller is still in the default Viewer group. Idempotent
 * per user: a user who already belongs to an org gets that org back.
 */
export const handler: Schema['provisionOrganization']['functionHandler'] = async (
  event
) => {
  const name = event.arguments.name?.trim();
  if (!name || name.length < 2) {
    throw new Error('Organization name must be at least 2 characters.');
  }

  const identity = event.identity as
    | { sub?: string; username?: string }
    | null
    | undefined;
  const cognitoSub = identity?.sub;
  const username = identity?.username;
  if (!cognitoSub || !username) {
    throw new Error('provisionOrganization requires a signed-in user.');
  }

  // 1. Resolve the caller's User record
  const userRes = await graphql<{
    usersByCognitoSub: { items: UserRecord[] };
  }>(
    `query ByCognitoSub($sub: String!) {
      usersByCognitoSub(cognitoSub: $sub, limit: 1) { items { id orgId email } }
    }`,
    { sub: cognitoSub }
  );
  const user = userRes.usersByCognitoSub.items[0];
  if (!user) {
    throw new Error(
      'User record not found. Sign out and back in, then try again.'
    );
  }

  if (user.orgId) {
    const existing = await graphql<{
      getOrganization: { id: string; slug: string } | null;
    }>(`query GetOrg($id: ID!) { getOrganization(id: $id) { id slug } }`, {
      id: user.orgId,
    });
    if (existing.getOrganization) {
      return {
        orgId: existing.getOrganization.id,
        slug: existing.getOrganization.slug,
      };
    }
  }

  // 2. Create the Organization with a unique slug
  const slug = await findFreeSlug(slugify(name));
  const orgRes = await graphql<{
    createOrganization: { id: string; slug: string };
  }>(
    `mutation CreateOrg($input: CreateOrganizationInput!) {
      createOrganization(input: $input) { id slug }
    }`,
    { input: { name, slug, isActive: true } }
  );
  const org = orgRes.createOrganization;

  // 3. Link the User and denormalize the role
  await graphql(
    `mutation UpdateUser($input: UpdateUserInput!) {
      updateUser(input: $input) { id orgId }
    }`,
    { input: { id: user.id, orgId: org.id, role: ADMIN } }
  );

  // 4. Elevate to Admin — the client must refresh its session to see it
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      GroupName: ADMIN,
    })
  );

  console.log('ProvisionOrganization: provisioned', { orgId: org.id, slug });
  return { orgId: org.id, slug: org.slug };
};
