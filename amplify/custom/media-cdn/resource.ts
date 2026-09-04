import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Private media CDN — on-demand image variants with double-layer caching
 * (docs/image-delivery.md; pattern: aws-samples/image-optimization).
 *
 *   viewer → CloudFront
 *     · viewer-request CloudFront Function: access mode, prefix + param
 *       whitelist, Accept-based format, path normalization
 *     · origin group: transformed bucket (OAC) → 403/404 failover to the
 *       sharp Lambda's Function URL (OAC), which writes the derivative back
 *
 * Access modes (P1 → P2 of the plan):
 *   - publicKeyPem set   → CloudFront signed URLs enforced (key group)
 *   - allowOpen          → open distribution (sandbox/dev testing ONLY)
 *   - neither            → fail closed: every request gets 403 at the edge
 */

export interface MediaCdnProps {
  /** Bucket holding the untouched originals (read-only to the CDN). */
  originalsBucket: s3.IBucket;
  /** Key prefixes the CDN may serve, e.g. ["uploads/", "logos/"]. */
  allowedPrefixes: string[];
  /** Serve without signed URLs. Sandbox/dev testing only. */
  allowOpen?: boolean;
  /** PEM public key for CloudFront signed URLs (P2). */
  publicKeyPem?: string;
  /** Days before cached derivatives expire from the transformed bucket. */
  derivativeExpiryDays?: number;
}

const here = dirname(fileURLToPath(import.meta.url));

/** Matches the sharp version in package.json/package-lock. */
const SHARP_SPEC = 'sharp@^0.35.0';

export function createMediaCdn(stack: Stack, props: MediaCdnProps) {
  const expiryDays = props.derivativeExpiryDays ?? 90;
  const mode = props.publicKeyPem
    ? 'signed'
    : props.allowOpen
      ? 'open'
      : 'closed';

  // ── Transformed-derivative bucket (second-level cache) ─────────────
  const transformedBucket = new s3.Bucket(stack, 'MediaTransformedBucket', {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    lifecycleRules: [{ expiration: Duration.days(expiryDays) }],
    removalPolicy: RemovalPolicy.DESTROY, // derivatives are regenerable
    autoDeleteObjects: true,
  });

  // ── Transform Lambda (sharp, arm64) ────────────────────────────────
  const transformFn = new NodejsFunction(stack, 'MediaTransformFn', {
    entry: join(here, 'transform', 'handler.ts'),
    runtime: lambda.Runtime.NODEJS_22_X,
    architecture: lambda.Architecture.ARM_64,
    memorySize: 1536,
    timeout: Duration.seconds(30),
    environment: {
      ORIGINALS_BUCKET: props.originalsBucket.bucketName,
      TRANSFORMED_BUCKET: transformedBucket.bucketName,
    },
    bundling: {
      format: OutputFormat.ESM,
      // sharp ships native binaries — install linux/arm64 ones into the
      // asset instead of bundling (npm >= 10.4 for --cpu/--os/--libc).
      externalModules: ['sharp'],
      commandHooks: {
        beforeBundling: () => [],
        beforeInstall: () => [],
        afterBundling: (_inputDir: string, outputDir: string) => [
          // Anchor npm in the asset dir: without a package.json here npm
          // walks up to the repo root and mutates the project install.
          `cd ${outputDir} && echo '{"name":"media-transform-asset","private":true}' > package.json && npm install --cpu=arm64 --os=linux --libc=glibc --no-package-lock --no-save --silent ${SHARP_SPEC}`,
        ],
      },
    },
  });
  props.originalsBucket.grantRead(transformFn);
  transformedBucket.grantPut(transformFn);

  const fnUrl = transformFn.addFunctionUrl({
    authType: lambda.FunctionUrlAuthType.AWS_IAM,
  });

  // ── Viewer-request function (validate + normalize) ─────────────────
  const viewerFn = new cloudfront.Function(stack, 'MediaViewerFn', {
    runtime: cloudfront.FunctionRuntime.JS_2_0,
    comment: 'Media CDN: access mode, prefix/param whitelist, variant normalization',
    code: cloudfront.FunctionCode.fromInline(
      buildViewerFunctionCode(mode, props.allowedPrefixes)
    ),
  });

  // ── Distribution ───────────────────────────────────────────────────
  const keyGroups: cloudfront.IKeyGroup[] = [];
  if (props.publicKeyPem) {
    keyGroups.push(
      new cloudfront.KeyGroup(stack, 'MediaKeyGroup', {
        items: [
          new cloudfront.PublicKey(stack, 'MediaPublicKey', {
            encodedKey: props.publicKeyPem,
          }),
        ],
      })
    );
  }

  const distribution = new cloudfront.Distribution(stack, 'MediaDistribution', {
    comment: 'Media CDN (image variants)',
    defaultBehavior: {
      origin: new origins.OriginGroup({
        primaryOrigin:
          origins.S3BucketOrigin.withOriginAccessControl(transformedBucket),
        fallbackOrigin: origins.FunctionUrlOrigin.withOriginAccessControl(fnUrl),
        fallbackStatusCodes: [403, 404],
      }),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      // Variant is normalized INTO the path; query is dropped, so the
      // cache key is the path alone — signed-URL auth params never
      // fragment the cache (validation still happens on every request).
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      compress: true,
      functionAssociations: [
        {
          function: viewerFn,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        },
      ],
      trustedKeyGroups: keyGroups.length > 0 ? keyGroups : undefined,
    },
  });

  // OAC invoke permission for the Function URL origin
  transformFn.addPermission('AllowCloudFrontOAC', {
    principal: new iam.ServicePrincipal('cloudfront.amazonaws.com'),
    action: 'lambda:InvokeFunctionUrl',
    functionUrlAuthType: lambda.FunctionUrlAuthType.AWS_IAM,
    sourceArn: `arn:aws:cloudfront::${stack.account}:distribution/${distribution.distributionId}`,
  });

  new CfnOutput(stack, 'MediaCdnDomain', {
    value: distribution.distributionDomainName,
    description: `Media CDN domain (mode: ${mode})`,
  });
  new CfnOutput(stack, 'MediaCdnMode', { value: mode });

  return { distribution, transformedBucket, transformFn };
}

/**
 * CloudFront Function source (cloudfront-js-2.0 — no template literals,
 * URLSearchParams, or Node APIs in that runtime).
 *
 * Accepts ?w=&h=&q=&f= (f=auto resolves via Accept), validates hard
 * limits, sorts ops for one canonical cache key, and rewrites
 *   /uploads/a/b.jpg?w=192&f=auto  →  /uploads/a/b.jpg/f=webp,w=192
 * No params → "/original". Unknown params are rejected (they would mint
 * cache permutations and Lambda invocations).
 */
function buildViewerFunctionCode(
  mode: 'signed' | 'open' | 'closed',
  allowedPrefixes: string[]
): string {
  const prefixes = JSON.stringify(allowedPrefixes);
  const closed = mode === 'closed';
  return [
    'function handler(event) {',
    '  var request = event.request;',
    `  if (${closed}) {`,
    "    return { statusCode: 403, statusDescription: 'Forbidden', headers: { 'content-type': { value: 'text/plain' } } };",
    '  }',
    `  var prefixes = ${prefixes};`,
    '  var uri = request.uri;',
    '  var allowed = false;',
    '  for (var i = 0; i < prefixes.length; i++) {',
    "    if (uri.indexOf('/' + prefixes[i]) === 0) { allowed = true; break; }",
    '  }',
    '  if (!allowed || uri.indexOf("..") !== -1) {',
    "    return { statusCode: 403, statusDescription: 'Forbidden' };",
    '  }',
    '  var qs = request.querystring;',
    '  var ops = [];',
    '  var n;',
    "  if (qs.w) { n = parseInt(qs.w.value, 10); if (!(n >= 1 && n <= 4096)) return badRequest(); ops.push('w=' + n); }",
    "  if (qs.h) { n = parseInt(qs.h.value, 10); if (!(n >= 1 && n <= 4096)) return badRequest(); ops.push('h=' + n); }",
    "  if (qs.q) { n = parseInt(qs.q.value, 10); if (!(n >= 1 && n <= 100)) return badRequest(); ops.push('q=' + n); }",
    '  if (qs.f) {',
    '    var f = qs.f.value;',
    "    if (f === 'auto') {",
    "      var accept = request.headers.accept ? request.headers.accept.value : '';",
    "      f = accept.indexOf('image/avif') !== -1 ? 'avif' : (accept.indexOf('image/webp') !== -1 ? 'webp' : 'jpeg');",
    '    }',
    "    if (f !== 'jpeg' && f !== 'webp' && f !== 'avif' && f !== 'png') return badRequest();",
    "    ops.push('f=' + f);",
    '  }',
    '  ops.sort();',
    "  request.uri = uri + '/' + (ops.length ? ops.join(',') : 'original');",
    '  request.querystring = {};',
    '  return request;',
    '}',
    'function badRequest() {',
    "  return { statusCode: 400, statusDescription: 'Bad Request' };",
    '}',
  ].join('\n');
}
