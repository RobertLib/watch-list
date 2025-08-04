import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyStorageTransaction } from "./storage-transaction";

class QuotaStorage {
  data = new Map<string, string>();
  limit = Infinity;
  refused = new Set<string>();
  get used() {
    return [...this.data].reduce((total, [key, value]) => total + 2 * (key.length + value.length), 0);
  }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    const old = this.data.get(key);
    const previous = old === undefined ? 0 : 2 * (key.length + old.length);
    if (this.refused.has(key) || this.used - previous + 2 * (key.length + value.length) > this.limit) {
      throw new DOMException("QuotaExceededError");
    }
    this.data.set(key, value);
  }
  removeItem(key: string) { this.data.delete(key); }
}

let storage: QuotaStorage;
beforeEach(() => {
  storage = new QuotaStorage();
  vi.stubGlobal("window", { localStorage: storage });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("storage transaction quota ordering", () => {
  it("fits a complete size swap even when the caller lists the growing key first", () => {
    storage.setItem("a", "small");
    storage.setItem("b", "large".repeat(100));
    storage.limit = storage.used;
    expect(applyStorageTransaction(new Map([
      ["a", "large".repeat(100)], ["b", "small"],
    ]))).toEqual({ ok: true });
    expect(storage.getItem("a")).toBe("large".repeat(100));
    expect(storage.getItem("b")).toBe("small");
  });

  it("undoes successful grow and shrink writes before restoring the old large value", () => {
    storage.setItem("a", "large".repeat(100));
    storage.setItem("b", "small");
    storage.setItem("c", "old");
    const before = new Map(storage.data);
    storage.limit = storage.used;
    storage.refused.add("c");
    expect(applyStorageTransaction(new Map([
      ["a", "small"], ["b", "large".repeat(100)], ["c", "new".repeat(400)],
    ]))).toEqual({ ok: false, key: "c", rolledBack: true });
    expect(storage.data).toEqual(before);
  });

  it("never removes the existing value of a persistently refused key", () => {
    storage.setItem("a", "original");
    storage.refused.add("a");
    expect(applyStorageTransaction(new Map([["a", "replacement"]]))).toEqual({
      ok: false, key: "a", rolledBack: true,
    });
    expect(storage.getItem("a")).toBe("original");
  });

  it("refuses a deletion whose original value could not be written back", () => {
    storage.setItem("a", "original");
    storage.setItem("b", "old");
    const before = new Map(storage.data);
    storage.refused.add("a");
    expect(applyStorageTransaction(new Map([["a", null], ["b", "replacement"]]))).toEqual({
      ok: false, key: "a", rolledBack: true,
    });
    expect(storage.data).toEqual(before);
  });
});
