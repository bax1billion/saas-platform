import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import type { DocumentType } from '@smithy/types';
import type { OutputSchema, Prompt } from './types';

/**
 * The one place a model is called (docs/spine-services-design.md § 2.2).
 * Amazon Bedrock through the Converse API with a forced tool, so every
 * answer is JSON in the helper's schema and never free text. The model id
 * is an inference profile from the environment, never hardcoded, and the
 * vendor is never named on a screen. Retries once on throttling.
 */

export interface StructuredResult {
  output: unknown;
  modelId: string;
  tokensIn: number;
  tokensOut: number;
  stopReason: string;
}

export interface BedrockOptions {
  modelId: string;
  region?: string;
  guardrail?: { id: string; version: string };
}

let client: BedrockRuntimeClient | undefined;
function getClient(region?: string) {
  if (!client) client = new BedrockRuntimeClient(region ? { region } : {});
  return client;
}

/** The part of a Converse response the extractor reads (structural, so tests can fake it). */
export interface ToolResponse {
  stopReason?: string;
  output?: { message?: { role?: string; content?: Array<{ text?: string; toolUse?: { toolUseId?: string; name?: string; input?: unknown } }> } };
}

/** Pull the forced tool's input out of a Converse response (pure, tested). */
export function extractToolOutput(response: ToolResponse, toolName: string): unknown {
  const blocks = response.output?.message?.content ?? [];
  for (const b of blocks) {
    if (b.toolUse && b.toolUse.name === toolName) return b.toolUse.input;
  }
  return undefined;
}

function userContent(prompt: Prompt): ContentBlock[] {
  const content: ContentBlock[] = [];
  for (const img of prompt.images ?? []) content.push({ image: { format: img.format, source: { bytes: img.bytes } } });
  content.push({ text: prompt.text });
  return content;
}

export async function invokeStructured(prompt: Prompt, schema: OutputSchema, opts: BedrockOptions): Promise<StructuredResult> {
  const messages: Message[] = [{ role: 'user', content: userContent(prompt) }];
  const command = new ConverseCommand({
    modelId: opts.modelId,
    system: [{ text: prompt.system }],
    messages,
    inferenceConfig: { maxTokens: prompt.maxTokens ?? 600, temperature: 0 },
    toolConfig: {
      tools: [{ toolSpec: { name: schema.name, description: schema.description, inputSchema: { json: schema.json as unknown as DocumentType } } }],
      toolChoice: { tool: { name: schema.name } },
    },
    ...(opts.guardrail ? { guardrailConfig: { guardrailIdentifier: opts.guardrail.id, guardrailVersion: opts.guardrail.version } } : {}),
  });

  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await getClient(opts.region).send(command);
      return {
        output: extractToolOutput(res, schema.name),
        modelId: opts.modelId,
        tokensIn: res.usage?.inputTokens ?? 0,
        tokensOut: res.usage?.outputTokens ?? 0,
        stopReason: res.stopReason ?? 'unknown',
      };
    } catch (err) {
      last = err;
      const name = (err as { name?: string }).name ?? '';
      if (!/Throttling|ServiceUnavailable|ModelNotReady/i.test(name) || attempt === 1) throw err;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw last;
}
