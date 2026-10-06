/*
 * Copyright (c) 2020 Kiel University and others.
 * Native adaptation of the sorts elkjs (ELK compiled by GWT) runs.
 * SPDX-License-Identifier: EPL-2.0
 */

/**
 * GWT's `Collections.sort` / `List.sort` / `Arrays.sort(Object[])` (elkjs): top-down
 * merge sort over insertion-sorted runs shorter than 7. For a consistent comparator
 * this equals any stable sort; stateful or non-antisymmetric comparators (ELK's
 * model-order comparators) depend on this exact call sequence.
 */
export function gwtSort<T>(items: T[], compare: (left: T, right: T) => number): void {
  const sort = (temp: T[], array: T[], low: number, high: number, ofs: number): void => {
    if (high - low < 7) {
      for (let i = low + 1; i < high; i++)
        for (let j = i; j > low && compare(array[j - 1]!, array[j]!) > 0; j--)
          [array[j - 1], array[j]] = [array[j]!, array[j - 1]!];
      return;
    }
    const tempLow = low + ofs,
      tempHigh = high + ofs,
      tempMid = tempLow + ((tempHigh - tempLow) >> 1);
    sort(array, temp, tempLow, tempMid, -ofs);
    sort(array, temp, tempMid, tempHigh, -ofs);
    if (compare(temp[tempMid - 1]!, temp[tempMid]!) <= 0) {
      for (let i = tempLow; low < high;) array[low++] = temp[i++]!;
      return;
    }
    for (let left = tempLow, right = tempMid; low < high;)
      array[low++] =
        right >= tempHigh || (left < tempMid && compare(temp[left]!, temp[right]!) <= 0)
          ? temp[left++]!
          : temp[right++]!;
  };
  sort(items.slice(), items, 0, items.length, 0);
}

/**
 * ELK's own insertion sort (SortByInputModelProcessor / ModelOrderBarycenterHeuristic),
 * which preserves comparator decisions even when model and edge priorities conflict.
 */
export function insertionSort<T>(items: T[], compare: (left: T, right: T) => number): void {
  for (let i = 1; i < items.length; i++) {
    const value = items[i]!;
    let j = i;
    while (j > 0 && compare(items[j - 1]!, value) > 0) {
      items[j] = items[j - 1]!;
      j--;
    }
    items[j] = value;
  }
}
