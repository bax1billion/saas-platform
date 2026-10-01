import { describe, expect, it } from 'vitest';
import { federationPlan } from './federation-plan';

describe('federationPlan', () => {
  it('federates nothing by default', () => {
    expect(federationPlan({})).toEqual({
      methods: ['password'],
      google: false,
      microsoft: null,
      callbackUrls: ['http://localhost:3000/dashboard'],
      logoutUrls: ['http://localhost:3000/'],
    });
  });

  it('builds Google and a single-tenant Microsoft provider', () => {
    const plan = federationPlan({
      AUTH_FEDERATED_PROVIDERS: 'google,microsoft',
      AUTH_MICROSOFT_TENANT_ID: 'contoso.onmicrosoft.com',
      APP_URL: 'https://staging.example.com/',
      AWS_BRANCH: 'staging',
    });
    expect(plan.methods).toEqual(['password', 'google', 'microsoft']);
    expect(plan.google).toBe(true);
    expect(plan.microsoft).toEqual({
      issuerUrl: 'https://login.microsoftonline.com/contoso.onmicrosoft.com/v2.0',
    });
    expect(plan.callbackUrls).toEqual(['https://staging.example.com/dashboard']);
    expect(plan.logoutUrls).toEqual(['https://staging.example.com/']);
  });

  it('keeps localhost in a sandbox alongside APP_URL', () => {
    const plan = federationPlan({ AUTH_FEDERATED_PROVIDERS: 'google', APP_URL: 'http://localhost:3000' });
    expect(plan.callbackUrls).toEqual(['http://localhost:3000/dashboard']);
  });

  it('requires a tenant for Microsoft', () => {
    expect(() => federationPlan({ AUTH_FEDERATED_PROVIDERS: 'microsoft' })).toThrow(/AUTH_MICROSOFT_TENANT_ID/);
  });

  it('refuses a multi-tenant authority', () => {
    expect(() =>
      federationPlan({ AUTH_FEDERATED_PROVIDERS: 'microsoft', AUTH_MICROSOFT_TENANT_ID: 'common' })
    ).toThrow(/one tenant/);
  });

  it('requires APP_URL on a deployed branch with federation on', () => {
    expect(() => federationPlan({ AUTH_FEDERATED_PROVIDERS: 'google', AWS_BRANCH: 'main' })).toThrow(/APP_URL/);
  });

  it('ignores unknown provider ids', () => {
    expect(federationPlan({ AUTH_FEDERATED_PROVIDERS: 'okta' }).methods).toEqual(['password']);
  });
});
