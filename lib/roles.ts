/**
 * Who sees what inside the app, from the Cognito groups on the token.
 *
 * Org Admins and platform Operators manage the agency: they see the full
 * product lineup, prices, add buttons and billing. Members and Viewers see
 * the products their agency has and nothing that sells to them.
 */
export function canManageOrg(groups: readonly string[] | undefined): boolean {
  return !!groups && (groups.includes("Admin") || groups.includes("Operator"));
}

/**
 * Org Admin only: department configuration (catalogs, symbols, policy).
 * Deliberately NOT Operator — Operators have no standing access to org
 * data (docs/onboarding-and-permissions.md); they grant entitlements and
 * nothing else.
 */
export function isOrgAdmin(groups: readonly string[] | undefined): boolean {
  return !!groups && groups.includes("Admin");
}

/**
 * May write the working set of a module: Admin and Member. Viewers read,
 * and every module schema rejects their writes, so hide the controls
 * rather than let them hit a denied mutation.
 */
export function canEditOrgData(groups: readonly string[] | undefined): boolean {
  return !!groups && (groups.includes("Admin") || groups.includes("Member"));
}

/** "Good morning" / "Good afternoon" / "Good evening" for the app home. */
export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
