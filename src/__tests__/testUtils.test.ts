import {describe, expect, test} from 'vitest';
import {incrementMixAndMatchIterator, mixAndMatchObject} from './testUtils.js';

describe('mixAndMatchObject', () => {
  test('incrementMixAndMatchIterator', () => {
    let iterator = [0, 0, 0];
    const max = [2, 2, 2];

    let r = incrementMixAndMatchIterator(iterator, max);
    expect(iterator).toEqual([0, 0, 1]);
    expect(r).toBe(true);

    iterator = [0, 0, 1];
    r = incrementMixAndMatchIterator(iterator, max);
    expect(iterator).toEqual([0, 1, 0]);
    expect(r).toBe(true);

    iterator = [0, 1, 1];
    r = incrementMixAndMatchIterator(iterator, max);
    expect(iterator).toEqual([1, 0, 0]);
    expect(r).toBe(true);

    iterator = [1, 0];
    r = incrementMixAndMatchIterator(iterator, max);
    expect(iterator).toEqual([1, 1]);
    expect(r).toBe(true);

    iterator = [1, 1, 0];
    r = incrementMixAndMatchIterator(iterator, max);
    expect(iterator).toEqual([1, 1, 1]);
    expect(r).toBe(true);

    iterator = [1, 1, 1];
    r = incrementMixAndMatchIterator(iterator, max);
    expect(iterator).toEqual([1, 1, 1]);
    expect(r).toBe(false);
  });

  test('mixAndMatchObject', () => {
    type Obj = {
      num: number;
      str: string;
    };

    const result = mixAndMatchObject<Obj>({
      num: () => [0, 1],
      str: () => ['zero', 'one'],
    });

    expect(result).toEqual([
      {num: 0, str: 'zero'},
      {num: 0, str: 'one'},
      {num: 1, str: 'zero'},
      {num: 1, str: 'one'},
    ]);
  });
});
