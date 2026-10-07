/**
 * Organization sign-in policy for client code. The implementation lives in
 * amplify/shared/auth-policy.ts because the backend loads it at synth time
 * (amplify/ is ESM; a file outside it would load as CommonJS).
 */
export * from "../../amplify/shared/auth-policy";
