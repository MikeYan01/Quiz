import { describe, expect, it } from "vitest";

import { formatRemainingTime, scoreCorrectAnswer } from "./policy";

describe("challenge timing", () => {
  it.each([
    [0, 10],
    [4_999, 10],
    [5_000, 10],
    [5_001, 9],
    [6_000, 9],
    [6_001, 8],
    [7_000, 8],
    [7_001, 7],
    [8_000, 7],
    [8_001, 6],
    [9_000, 6],
    [9_001, 5],
    [10_000, 5],
    [10_001, 4],
    [11_000, 4],
    [11_001, 3],
    [12_000, 3],
    [12_001, 2],
    [13_000, 2],
    [13_001, 1],
    [14_000, 1],
    [14_001, 1],
    [14_999, 1],
    [15_000, 0],
    [15_001, 0],
  ])("scores an answer at %i ms as %i", (elapsedMs, expected) => {
    expect(scoreCorrectAnswer(elapsedMs)).toBe(expected);
  });

  it.each([
    [0, "0.0"],
    [1, "0.1"],
    [100, "0.1"],
    [101, "0.2"],
    [14_900, "14.9"],
    [14_999, "15.0"],
    [15_000, "15.0"],
  ])("rounds %i ms up to %s seconds", (remainingMs, expected) => {
    expect(formatRemainingTime(remainingMs)).toBe(expected);
  });
});
