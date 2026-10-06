import { Duration, Stack } from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The export renderer function (docs/spine-services-design.md § 3): a raw
 * CDK NodejsFunction, like the media CDN's transform function, because
 * @react-pdf/renderer and sharp cannot be bundled by defineFunction. Both
 * are installed into the asset after bundling, pinned to the versions in
 * the repo's package.json so the Lambda and the tests render the same
 * bytes. The Inter fonts ship with the asset; nothing is fetched from an
 * outside host at run time.
 *
 * The caller wires the table stream and the IAM grants in amplify/backend.ts.
 */

export interface ExportRendererProps {
  jobTable: dynamodb.ITable;
  bucket: s3.IBucket;
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');

/** `name@<installed version>`, read from node_modules directly: some
 *  packages (sharp) do not export their package.json. */
function pinned(name: string): string {
  const pkg = JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')) as { version: string };
  return `${name}@${pkg.version}`;
}

export function createExportRenderer(stack: Stack, props: ExportRendererProps) {
  const specs = [pinned('@react-pdf/renderer'), pinned('react'), pinned('sharp')].join(' ');
  const fontsDir = join(here, 'fonts');

  const fn = new NodejsFunction(stack, 'ExportRendererFn', {
    entry: join(here, 'handler.ts'),
    runtime: lambda.Runtime.NODEJS_22_X,
    architecture: lambda.Architecture.ARM_64,
    memorySize: 2048,
    timeout: Duration.minutes(5),
    environment: {
      EXPORT_JOB_TABLE: props.jobTable.tableName,
      EXPORTS_BUCKET: props.bucket.bucketName,
    },
    bundling: {
      format: OutputFormat.ESM,
      externalModules: ['@react-pdf/renderer', 'react', 'sharp'],
      commandHooks: {
        beforeBundling: () => [],
        beforeInstall: () => [],
        afterBundling: (_inputDir: string, outputDir: string) => [
          // Anchor npm in the asset dir so it never mutates the repo root.
          `cd ${outputDir} && echo '{"name":"export-renderer-asset","private":true,"type":"module"}' > package.json && npm install --cpu=arm64 --os=linux --libc=glibc --no-package-lock --no-save --silent ${specs}`,
          `cp -R ${fontsDir} ${outputDir}/fonts`,
        ],
      },
    },
  });

  props.jobTable.grantReadWriteData(fn);
  fn.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`arn:aws:s3:::${props.bucket.bucketName}/uploads/*`],
    })
  );
  fn.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [`arn:aws:s3:::${props.bucket.bucketName}/exports/*`],
    })
  );

  return { fn };
}
