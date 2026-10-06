import { createPublicKey } from 'node:crypto';

/**
 * Normalize a CloudFront public key supplied through an environment
 * variable. Hosting stores variables as one line, so a pasted PEM arrives
 * with its line breaks collapsed, as literal "\n" sequences, or
 * base64-encoded whole; CloudFront then answers "empty/invalid/out of
 * limits RSA Encoded Key". This accepts all of those, proves the result
 * is an RSA 2048 public key (the only kind CloudFront signs with), and
 * returns a proper PEM (64-character lines). Anything else, including a
 * placeholder, a private key or a 4096-bit key, returns undefined with a
 * synth-time warning, so the distribution falls closed instead of failing
 * the deploy.
 */
export function normalizePublicKeyPem(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let text = raw.trim();
  if (!text) return undefined;
  // Whole PEM base64-encoded on one line (what `base64 -i key.pub | tr -d '\n'` gives).
  if (!text.includes('BEGIN') && /^[A-Za-z0-9+/=]+$/.test(text)) {
    try {
      const decoded = Buffer.from(text, 'base64').toString('utf8');
      if (decoded.includes('BEGIN')) text = decoded;
    } catch {
      return warn('not base64');
    }
  }
  text = text.replace(/\\n/g, '\n');
  const m = text.match(/-----BEGIN ((?:RSA )?PUBLIC KEY)-----([\s\S]*?)-----END \1-----/);
  if (text.includes('BEGIN') && !m) return warn('not a public key block (a private key or another type)');
  const body = (m ? m[2] : text).replace(/[^A-Za-z0-9+/=]/g, '');
  if (body.length < 200 || !/^[A-Za-z0-9+/]+=*$/.test(body)) return warn('body is too short or not base64');
  const label = m ? m[1] : 'PUBLIC KEY';
  const lines = body.match(/.{1,64}/g) ?? [];
  const pem = `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
  try {
    const key = createPublicKey(pem);
    const bits = key.asymmetricKeyDetails?.modulusLength;
    if (key.asymmetricKeyType !== 'rsa' || bits !== 2048) return warn(`CloudFront needs an RSA 2048 key, got ${key.asymmetricKeyType} ${bits ?? '?'}`);
  } catch {
    return warn('does not parse as a public key');
  }
  return pem;
}

function warn(why: string): undefined {
  console.warn(`MEDIA_CDN_PUBLIC_KEY ignored (${why}); the media CDN deploys closed.`);
  return undefined;
}
