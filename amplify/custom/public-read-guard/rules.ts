import type { CfnWebACL } from 'aws-cdk-lib/aws-wafv2';

/**
 * The web ACL rules for the public surface of the GraphQL API, as plain
 * data so the numbers are tested without a synth. A request made with the
 * API key (a map shared by link, a lead form, the public doctor page) is
 * the only public surface; a signed-in request carries a sign-in token and
 * no key, so the rate rule never sees it.
 */

/**
 * The web ACL's description. The service accepts only word characters,
 * `+=:#@/-,.` and inner spaces (see `WAF_DESCRIPTION_PATTERN`): a semicolon
 * failed every staging deploy from Oct 14, 2026 until it was removed.
 */
export const PUBLIC_READ_GUARD_DESCRIPTION =
  'Rate limit on the GraphQL API key traffic, the managed common rules in count mode.';

/** WAFv2's constraint on a web ACL description, as the service reports it. */
export const WAF_DESCRIPTION_PATTERN = /^[\w+=:#@/\-,.][\w+=:#@/\-,.\s]+[\w+=:#@/\-,.]$/;

/** Requests per address per window before the key's traffic is refused. */
export const PUBLIC_RATE_LIMIT = 300;

/** The window the limit counts over, in seconds (one of the service's fixed windows). */
export const PUBLIC_RATE_WINDOW_SECONDS = 300;

/** What a refused request gets: "slow down", not "forbidden". */
export const RATE_LIMITED_STATUS = 429;

/** The header the data client sends when a call runs with the API key. */
export const API_KEY_HEADER = 'x-api-key';

/**
 * Only requests that carry the API key count toward the limit. The header
 * match is untyped in the construct and goes to CloudFormation as written,
 * so its key is spelled the template's way (`Name`).
 */
export const publicKeyRequest = {
  sizeConstraintStatement: {
    fieldToMatch: { singleHeader: { Name: API_KEY_HEADER } },
    comparisonOperator: 'GT',
    size: 0,
    textTransformations: [{ priority: 0, type: 'NONE' }],
  },
} satisfies CfnWebACL.StatementProperty;

/** The rate rule: the key's traffic, per address, over the window. */
export const publicKeyRateRule = {
  name: 'PublicKeyRate',
  priority: 0,
  statement: {
    rateBasedStatement: {
      limit: PUBLIC_RATE_LIMIT,
      evaluationWindowSec: PUBLIC_RATE_WINDOW_SECONDS,
      aggregateKeyType: 'IP',
      scopeDownStatement: publicKeyRequest,
    },
  },
  action: { block: { customResponse: { responseCode: RATE_LIMITED_STATUS } } },
  visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'PublicKeyRate', sampledRequestsEnabled: true },
} satisfies CfnWebACL.RuleProperty;

/**
 * The managed common rule set, counting only: it reports what it would
 * have blocked (its body-size rule would refuse a large mutation) so the
 * first month's log says whether any of it can be turned on.
 */
export const commonRuleSetCountRule = {
  name: 'CommonRuleSetCount',
  priority: 1,
  statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesCommonRuleSet' } },
  overrideAction: { count: {} },
  visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'CommonRuleSetCount', sampledRequestsEnabled: true },
} satisfies CfnWebACL.RuleProperty;

export const PUBLIC_READ_RULES: CfnWebACL.RuleProperty[] = [publicKeyRateRule, commonRuleSetCountRule];
