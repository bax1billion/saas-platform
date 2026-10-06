import { describe, expect, it } from 'vitest';
import { extractToolOutput } from './bedrock';

describe('extractToolOutput', () => {
  it('returns the forced tool input and ignores other blocks', () => {
    const res = {
      stopReason: 'tool_use',
      output: {
        message: {
          role: 'assistant' as const,
          content: [
            { text: 'Here is the caption.' },
            { toolUse: { toolUseId: 't1', name: 'other', input: { nope: true } } },
            { toolUse: { toolUseId: 't2', name: 'caption', input: { caption: 'Smoke on the B side.' } } },
          ],
        },
      },
    };
    expect(extractToolOutput(res, 'caption')).toEqual({ caption: 'Smoke on the B side.' });
  });

  it('is undefined when the model did not answer with the tool', () => {
    expect(extractToolOutput({ stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text: 'no' }] } } }, 'caption')).toBeUndefined();
    expect(extractToolOutput({ stopReason: 'end_turn', output: undefined }, 'caption')).toBeUndefined();
  });
});
