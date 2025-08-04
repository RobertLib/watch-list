export type StorageChanges = ReadonlyMap<string, string | null>;

export type StorageTransactionResult =
  | { ok: true }
  | { ok: false; key: string | null; rolledBack: boolean };

interface StorageTransactionOptions {
  /** Abort before/after writes when the owner of prepared data was removed. */
  validate?: () => void;
  validationKey?: string;
}

interface Change {
  key: string;
  before: string | null;
  after: string | null;
}

function storedSize(key: string, value: string | null): number {
  return value === null ? 0 : key.length + value.length;
}

function sizeChange(change: Change): number {
  return storedSize(change.key, change.after) - storedSize(change.key, change.before);
}

function write(storage: Storage, key: string, value: string | null): void {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

/**
 * Replace related keys together, restoring their exact raw values on refusal.
 * Shrinking writes run first in both directions: restoring a large old value
 * beside a large incoming value can exceed quota even though the original
 * complete snapshot fits. Failed setItem calls are atomic, so only successful
 * changes need undoing; an unchanged key whose writes are blocked stays intact.
 * Callers announce changes only after this synchronous operation succeeds.
 */
export function applyStorageTransaction(
  changes: StorageChanges,
  options: StorageTransactionOptions = {},
): StorageTransactionResult {
  if (typeof window === "undefined") {
    return { ok: false, key: null, rolledBack: true };
  }

  const pending: Change[] = [];
  let storage: Storage;
  let readingKey: string | null = null;
  try {
    readingKey = options.validationKey ?? null;
    options.validate?.();
    storage = window.localStorage;
    for (const [key, after] of changes) {
      readingKey = key;
      const before = storage.getItem(key);
      if (before !== after) pending.push({ key, before, after });
    }
    // Deleting an existing key would need setItem to put it back on failure.
    // Check that unchanged value first: some storage policies allow removal
    // while refusing writes, and removing their only copy is not reversible.
    for (const change of pending) {
      if (change.after !== null || change.before === null) continue;
      readingKey = change.key;
      storage.setItem(change.key, change.before);
    }
  } catch (error) {
    console.error("Error reading storage before replacement:", error);
    return { ok: false, key: readingKey, rolledBack: true };
  }

  pending.sort((a, b) => sizeChange(a) - sizeChange(b));
  const applied: Change[] = [];
  let writingKey: string | null = null;
  const rollback = (): boolean => {
    applied.sort((a, b) => sizeChange(b) - sizeChange(a));
    let rolledBack = true;
    for (const previous of applied) {
      try {
        write(storage, previous.key, previous.before);
      } catch (rollbackError) {
        rolledBack = false;
        console.error(`Error restoring storage key ${previous.key}:`, rollbackError);
      }
    }
    return rolledBack;
  };
  for (const change of pending) {
    try {
      writingKey = options.validationKey ?? change.key;
      options.validate?.();
      writingKey = change.key;
      write(storage, change.key, change.after);
      applied.push(change);
    } catch (error) {
      console.error(`Error replacing storage key ${change.key}:`, error);
      // Reverse the size changes, rather than the write order: incoming values
      // must release their space before the original large values return.
      return { ok: false, key: writingKey, rolledBack: rollback() };
    }
  }

  try {
    options.validate?.();
  } catch (error) {
    console.error("Error validating storage replacement:", error);
    return { ok: false, key: options.validationKey ?? null, rolledBack: rollback() };
  }

  return { ok: true };
}
