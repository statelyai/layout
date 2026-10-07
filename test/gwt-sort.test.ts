import { expect, it } from "vitest";
import { gwtSort } from "../src/layered/gwt-sort";

type Compare = (a: number, b: number) => number;

/** elkjs 0.11.1 `mergeSort`/`mergeSort_0`/`insertionSort`/`merge`, transcribed verbatim. */
function elkjsMergeSort(x: number[], comp: Compare): void {
  const insertionSort = (array: number[], low: number, high: number) => {
    for (let i = low + 1; i < high; ++i)
      for (let j = i; j > low && comp(array[j - 1]!, array[j]!) > 0; --j) {
        const t = array[j]!;
        array[j] = array[j - 1]!;
        array[j - 1] = t;
      }
  };
  const merge = (
    src: number[],
    srcLow: number,
    srcMid: number,
    srcHigh: number,
    dest: number[],
    destLow: number,
    destHigh: number,
  ) => {
    let topIdx = srcMid;
    while (destLow < destHigh)
      if (topIdx >= srcHigh || (srcLow < srcMid && comp(src[srcLow]!, src[topIdx]!) <= 0))
        dest[destLow++] = src[srcLow++]!;
      else dest[destLow++] = src[topIdx++]!;
  };
  const mergeSort0 = (temp: number[], array: number[], low: number, high: number, ofs: number) => {
    if (high - low < 7) {
      insertionSort(array, low, high);
      return;
    }
    let tempLow = low + ofs;
    const tempHigh = high + ofs,
      tempMid = tempLow + ((tempHigh - tempLow) >> 1);
    mergeSort0(array, temp, tempLow, tempMid, -ofs);
    mergeSort0(array, temp, tempMid, tempHigh, -ofs);
    if (comp(temp[tempMid - 1]!, temp[tempMid]!) <= 0) {
      while (low < high) array[low++] = temp[tempLow++]!;
      return;
    }
    merge(temp, tempLow, tempMid, tempHigh, array, low, high);
  };
  mergeSort0(x.slice(), x, 0, x.length, 0);
}

/** A deterministic, inconsistent comparator that records every call. */
const recording = (seed: number) => {
  const calls: string[] = [];
  const compare: Compare = (a, b) => {
    calls.push(`${a},${b}`);
    return ((a * 31 + b * 17 + seed) % 5) - 2;
  };
  return { calls, compare };
};

it("replays GWT Collections.sort comparator calls exactly", () => {
  for (let length = 0; length <= 40; length++)
    for (const seed of [0, 1, 2, 3]) {
      const input = Array.from({ length }, (_, i) => (i * 7 + seed) % (length + 3));
      const expected = input.slice(),
        actual = input.slice();
      const reference = recording(seed),
        native = recording(seed);
      elkjsMergeSort(expected, reference.compare);
      gwtSort(actual, native.compare);
      expect(native.calls).toEqual(reference.calls);
      expect(actual).toEqual(expected);
    }
});

it("keeps order for an always-negative comparator, which built-in sort reverses", () => {
  const calls: string[] = [];
  const items = ["a", "b", "c"];
  const alwaysBefore = (left: string, right: string) => (calls.push(left + right), -1);
  gwtSort(items, alwaysBefore);
  expect(calls).toEqual(["ab", "bc"]);
  expect(items).toEqual(["a", "b", "c"]);
  expect(["a", "b", "c"].sort(alwaysBefore)).toEqual(["c", "b", "a"]);
});

it("matches a stable built-in sort for consistent comparators", () => {
  const input = Array.from({ length: 50 }, (_, i) => ({ key: (i * 13) % 7, i }));
  const compare = (a: { key: number }, b: { key: number }) => a.key - b.key;
  const actual = input.slice();
  gwtSort(actual, compare);
  expect(actual).toEqual(input.slice().sort(compare));
});
