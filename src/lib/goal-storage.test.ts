// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getGoalSnapshot,
  saveGoal,
  subscribeToGoal,
} from "./goal";

let unsubscribe: (() => void) | undefined;
beforeEach(() => localStorage.clear());
afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the live yearly goal", () => {
  it("keeps snapshots stable and publishes a saved or cleared goal in this tab", () => {
    const observed: unknown[] = [];
    unsubscribe = subscribeToGoal(() => observed.push(getGoalSnapshot()));
    const goal = { year: "2026", target: 52 };

    expect(saveGoal(goal)).toBe(true);
    const snapshot = getGoalSnapshot();
    expect(snapshot).toEqual(goal);
    expect(getGoalSnapshot()).toBe(snapshot);
    expect(saveGoal(null)).toBe(true);
    expect(observed).toEqual([goal, null]);
  });

  it("publishes the stored goal after a refused write instead of the requested target", () => {
    const original = { year: "2026", target: 52 };
    saveGoal(original);
    const snapshot = getGoalSnapshot();
    const observed: unknown[] = [];
    unsubscribe = subscribeToGoal(() => observed.push(getGoalSnapshot()));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(saveGoal({ year: "2026", target: 10 })).toBe(false);
    expect(getGoalSnapshot()).toBe(snapshot);
    expect(observed).toEqual([original]);
  });
});
