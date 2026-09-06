/**
 * Shared backend constants — single source of truth for values referenced
 * from multiple Amplify resources.
 */

/**
 * Cognito groups, in privilege order. Referenced by auth/resource.ts,
 * the post-confirmation trigger, and the data schema's authorization rules.
 * The frontend mirror lives in config/site.ts (siteConfig.auth.groups).
 */
export const GROUPS = ['Operator', 'Admin', 'Member', 'Viewer'] as const;
export type Group = (typeof GROUPS)[number];

/** Platform staff (founders/support). Deliberately excluded from org and
 *  vertical model rules — zero standing access to customer data; the only
 *  model that grants Operator anything is OrgEntitlementOverride. Assigned
 *  manually (Cognito console / admin-add-user-to-group). */
export const OPERATOR: Group = 'Operator';
export const ADMIN: Group = 'Admin';
export const MEMBER: Group = 'Member';
export const VIEWER: Group = 'Viewer';

/** Default group assigned by the post-confirmation trigger on sign-up. */
export const DEFAULT_GROUP: Group = VIEWER;
