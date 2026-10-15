import { describe, expect, it } from 'vitest';
import {
  API_KEY_HEADER,
  commonRuleSetCountRule,
  PUBLIC_RATE_LIMIT,
  PUBLIC_RATE_WINDOW_SECONDS,
  PUBLIC_READ_GUARD_DESCRIPTION,
  PUBLIC_READ_RULES,
  publicKeyRateRule,
  RATE_LIMITED_STATUS,
  WAF_DESCRIPTION_PATTERN,
} from './rules';

describe('public read guard rules', () => {
  it('describes the web ACL in characters the service accepts (a semicolon failed the Oct 14 2026 staging deploys)', () => {
    expect(PUBLIC_READ_GUARD_DESCRIPTION).toMatch(WAF_DESCRIPTION_PATTERN);
    expect(PUBLIC_READ_GUARD_DESCRIPTION.length).toBeLessThanOrEqual(256);
    expect('a; b').not.toMatch(WAF_DESCRIPTION_PATTERN);
    expect(' leading space').not.toMatch(WAF_DESCRIPTION_PATTERN);
  });

  it('names every rule and metric in characters the service accepts', () => {
    for (const rule of [publicKeyRateRule, commonRuleSetCountRule]) {
      expect(rule.name).toMatch(/^[\w\-]{1,128}$/);
      expect(rule.visibilityConfig.metricName).toMatch(/^[\w#:.\-/]{1,128}$/);
    }
  });

  it('limits the API key traffic to 300 requests per address per five minutes', () => {
    expect(PUBLIC_RATE_LIMIT).toBe(300);
    expect(PUBLIC_RATE_WINDOW_SECONDS).toBe(300);
    const rate = publicKeyRateRule.statement.rateBasedStatement;
    expect(rate.limit).toBe(PUBLIC_RATE_LIMIT);
    expect(rate.evaluationWindowSec).toBe(PUBLIC_RATE_WINDOW_SECONDS);
    expect(rate.aggregateKeyType).toBe('IP');
  });

  it('counts only requests that carry the API key, so a signed-in session is never limited', () => {
    const scope = publicKeyRateRule.statement.rateBasedStatement.scopeDownStatement.sizeConstraintStatement;
    // CloudFormation's spelling: the field is untyped in the construct and copied as written.
    expect(scope.fieldToMatch.singleHeader).toEqual({ Name: API_KEY_HEADER });
    expect(API_KEY_HEADER).toBe('x-api-key');
    expect(scope.comparisonOperator).toBe('GT');
    expect(scope.size).toBe(0);
  });

  it('answers a refused request with 429, not 403', () => {
    expect(RATE_LIMITED_STATUS).toBe(429);
    expect(publicKeyRateRule.action.block.customResponse.responseCode).toBe(429);
  });

  it('runs the managed common rule set in count mode only', () => {
    expect(commonRuleSetCountRule.statement.managedRuleGroupStatement).toEqual({ vendorName: 'AWS', name: 'AWSManagedRulesCommonRuleSet' });
    expect(commonRuleSetCountRule.overrideAction).toEqual({ count: {} });
    expect('action' in commonRuleSetCountRule).toBe(false);
  });

  it('keeps the rate rule first and every rule visible in metrics', () => {
    expect(PUBLIC_READ_RULES.map((r) => [r.name, r.priority])).toEqual([
      ['PublicKeyRate', 0],
      ['CommonRuleSetCount', 1],
    ]);
    for (const rule of [publicKeyRateRule, commonRuleSetCountRule]) {
      expect(rule.visibilityConfig.cloudWatchMetricsEnabled).toBe(true);
      expect(rule.visibilityConfig.sampledRequestsEnabled).toBe(true);
    }
  });
});
