import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_RECORD,
  HIGHER_LOWER_STORAGE_KEY,
  getRecord,
  recordRound,
  sanitizeRecord,
  saveRecord,
} from "./higher-lower";

/** A localStorage with a seam for refusing a write, as a full quota would. */
class FakeStorage {
  private data = new Map<string, string>();
  failOn = new Set<string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    if (this.failOn.has(key)) throw new DOMException("QuotaExceededError");
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal("window", { localStorage: storage });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sanitizeRecord", () => {
  it("rebuilds a well-formed record from the fields it understands", () => {
    expect(sanitizeRecord({ best: 12, totalRounds: 340, junk: "ignored" })).toEqual(
      { best: 12, totalRounds: 340 },
    );
  });

  it("drops counts that are not whole and non-negative", () => {
    // Storage is hand-editable, and a negative best would render as a record
    // nobody could beat.
    expect(sanitizeRecord({ best: -3, totalRounds: 1.5 })).toEqual(EMPTY_RECORD);
    expect(sanitizeRecord({ best: "9", totalRounds: NaN })).toEqual({
      best: 9,
      totalRounds: 0,
    });
  });

  it("answers with an empty record for anything that is not an object", () => {
    expect(sanitizeRecord(null)).toEqual(EMPTY_RECORD);
    expect(sanitizeRecord("42")).toEqual(EMPTY_RECORD);
    expect(sanitizeRecord([1, 2])).toEqual(EMPTY_RECORD);
  });
});

describe("getRecord", () => {
  it("reads back what was saved", () => {
    saveRecord({ best: 7, totalRounds: 20 });
    expect(getRecord()).toEqual({ best: 7, totalRounds: 20 });
  });

  it("starts empty when nothing has been stored", () => {
    expect(getRecord()).toEqual(EMPTY_RECORD);
  });

  it("starts empty rather than throwing on unparseable storage", () => {
    storage.setItem(HIGHER_LOWER_STORAGE_KEY, "{not json");
    expect(getRecord()).toEqual(EMPTY_RECORD);
  });

  it("repairs a stored record that is the wrong shape", () => {
    storage.setItem(HIGHER_LOWER_STORAGE_KEY, '{"best":"lots"}');
    expect(getRecord()).toEqual(EMPTY_RECORD);
  });
});

describe("saveRecord", () => {
  it("swallows a refused write rather than failing the round", () => {
    storage.failOn.add(HIGHER_LOWER_STORAGE_KEY);

    // Private browsing refuses writes entirely. The run still happened; it just
    // will not be remembered.
    expect(() => saveRecord({ best: 3, totalRounds: 3 })).not.toThrow();
  });
});

describe("recordRound", () => {
  it("raises the best when the run beat it", () => {
    expect(recordRound({ best: 4, totalRounds: 10 }, 9)).toEqual({
      best: 9,
      totalRounds: 11,
    });
  });

  it("keeps the standing best when the run fell short", () => {
    expect(recordRound({ best: 9, totalRounds: 11 }, 2)).toEqual({
      best: 9,
      totalRounds: 12,
    });
  });

  it("counts the round even when the streak was zero", () => {
    // A first-time player who gets the first one wrong should still see the
    // total move – it is the only number on screen that does.
    expect(recordRound(EMPTY_RECORD, 0)).toEqual({ best: 0, totalRounds: 1 });
  });

  it("returns a new object rather than mutating the one it was given", () => {
    const record = { best: 4, totalRounds: 10 };
    const next = recordRound(record, 9);

    expect(record).toEqual({ best: 4, totalRounds: 10 });
    expect(next).not.toBe(record);
  });
});
