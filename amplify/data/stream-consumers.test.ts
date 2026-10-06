import { describe, expect, it } from 'vitest';
import { mergeStreamConsumers } from './stream-consumers';

describe('mergeStreamConsumers', () => {
  it('keeps every module’s handlers when two modules consume the same table', () => {
    // The case object spread gets wrong: the second map would have
    // replaced the first module's handler on the shared table.
    const a = { Shared: ['aHandler'], OnlyA: ['aHandler'] };
    const b = { Shared: ['bHandler'] };
    expect(mergeStreamConsumers(a, b)).toEqual({
      Shared: ['aHandler', 'bHandler'],
      OnlyA: ['aHandler'],
    });
  });

  it('drops a handler listed twice for one table and keeps first-seen order', () => {
    const a = { T: ['one', 'two'] };
    const b = { T: ['two', 'three', 'one'] };
    expect(mergeStreamConsumers(a, b)).toEqual({ T: ['one', 'two', 'three'] });
  });

  it('is plain concatenation for disjoint maps, and empty for no maps', () => {
    expect(mergeStreamConsumers({ A: ['x'] }, { B: ['y'] })).toEqual({ A: ['x'], B: ['y'] });
    expect(mergeStreamConsumers()).toEqual({});
  });

  it('does not mutate its inputs', () => {
    const a = { T: ['one'] } as const;
    const b = { T: ['two'] } as const;
    mergeStreamConsumers(a, b);
    expect(a.T).toEqual(['one']);
    expect(b.T).toEqual(['two']);
  });
});
