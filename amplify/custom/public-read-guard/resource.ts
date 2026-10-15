import { Fn, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { PUBLIC_READ_GUARD_DESCRIPTION, PUBLIC_READ_RULES } from './rules';

/**
 * AWS WAF in front of the GraphQL API, for its public surface: the
 * operations the API key authorizes (a record shared by link, a public
 * form) can be called by anyone holding the site's key, and the key is in
 * every page. The web ACL rate-limits that traffic per address and counts
 * what the managed common rule set would block (./rules.ts); signed-in
 * traffic carries no key and is never limited. Refused and counted
 * requests go to a log group (the service requires the `aws-waf-logs-`
 * prefix); allowed ones are not logged.
 *
 * Its own stack: the association names the API's ARN, so this stack
 * depends on the data stack one way and nothing there depends on it.
 */
export interface PublicReadGuardProps {
  /** The GraphQL API's ARN (`backend.data.resources.graphqlApi.arn`). */
  apiArn: string;
  /** A synth-time name to make the ACL and log group names unique per environment. */
  uniqueName: string;
}

export function createPublicReadGuard(stack: Stack, props: PublicReadGuardProps) {
  const suffix = props.uniqueName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-48);

  const acl = new wafv2.CfnWebACL(stack, 'PublicReadGuard', {
    name: `public-read-guard-${suffix}`,
    description: PUBLIC_READ_GUARD_DESCRIPTION,
    scope: 'REGIONAL',
    defaultAction: { allow: {} },
    rules: PUBLIC_READ_RULES,
    visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: `public-read-guard-${suffix}`, sampledRequestsEnabled: true },
  });

  new wafv2.CfnWebACLAssociation(stack, 'PublicReadGuardAssociation', {
    resourceArn: props.apiArn,
    webAclArn: acl.attrArn,
  });

  const logGroup = new logs.LogGroup(stack, 'PublicReadGuardLogs', {
    logGroupName: `aws-waf-logs-${suffix}`,
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  new wafv2.CfnLoggingConfiguration(stack, 'PublicReadGuardLogging', {
    resourceArn: acl.attrArn,
    // The service wants the log group's ARN without CloudWatch's ":*" suffix.
    logDestinationConfigs: [Fn.select(0, Fn.split(':*', logGroup.logGroupArn))],
    loggingFilter: {
      DefaultBehavior: 'DROP',
      Filters: [
        {
          Behavior: 'KEEP',
          Requirement: 'MEETS_ANY',
          Conditions: [{ ActionCondition: { Action: 'BLOCK' } }, { ActionCondition: { Action: 'COUNT' } }],
        },
      ],
    },
  });

  return { aclArn: acl.attrArn, logGroupName: logGroup.logGroupName };
}
