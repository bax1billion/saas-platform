import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizePublicKeyPem } from './public-key';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const big = generateKeyPairSync('rsa', { modulusLength: 4096 }).publicKey.export({ type: 'spki', format: 'pem' }) as string;

describe('normalizePublicKeyPem', () => {
  it('returns a well-formed PEM unchanged in substance', () => {
    expect(normalizePublicKeyPem(pem)).toBe(pem);
  });

  it('repairs a key whose line breaks were collapsed by a console', () => {
    const oneLine = pem.replace(/\n/g, '');
    const literal = pem.replace(/\n/g, '\\n');
    const spaced = pem.replace(/\n/g, ' ');
    expect(normalizePublicKeyPem(oneLine)).toBe(pem);
    expect(normalizePublicKeyPem(literal)).toBe(pem);
    expect(normalizePublicKeyPem(spaced)).toBe(pem);
  });

  it('accepts the whole PEM base64-encoded on one line', () => {
    expect(normalizePublicKeyPem(Buffer.from(pem).toString('base64'))).toBe(pem);
  });

  it('rejects a private key, a 4096-bit key, placeholders and junk so the distribution falls closed', () => {
    expect(normalizePublicKeyPem(privatePem)).toBeUndefined();
    expect(normalizePublicKeyPem(privatePem.replace(/\n/g, ''))).toBeUndefined();
    expect(normalizePublicKeyPem(big)).toBeUndefined();
    expect(normalizePublicKeyPem(undefined)).toBeUndefined();
    expect(normalizePublicKeyPem('')).toBeUndefined();
    expect(normalizePublicKeyPem('PLACE_HOLDER')).toBeUndefined();
    expect(normalizePublicKeyPem('-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----')).toBeUndefined();
  });
});
