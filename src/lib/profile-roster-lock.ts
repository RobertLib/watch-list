/** Roster, profile switches, watchlist edits and restores share one origin-wide lock. */
export const PROFILE_ROSTER_LOCK = "watch-list:profile-roster";

const LOCK_DATABASE = "watch-list:profile-locks";
const LOCK_STORE = "locks";

type SynchronousOperation<T> = (() => T) &
  (Extract<T, PromiseLike<unknown>> extends never ? unknown : never);

/**
 * localStorage has no compare-and-swap: a second tab can replace a value read
 * by the first. IndexedDB readwrite transactions with the same store serialize
 * across connections, including contexts without Web Locks (such as HTTP).
 * Execute the complete synchronous read/validate/write in a request callback
 * while that transaction holds its lock. The database stores no personal data.
 *
 * Web Locks remain an outer gate where available. Those contexts also acquire
 * the IndexedDB gate, so they coordinate with contexts without Web Locks. If
 * IndexedDB is absent or unusable – `null` where a browser disables it, or a
 * database that refuses to open – Web Locks alone still provide coordination:
 * every context of a secure origin has them, so nothing is left uncoordinated.
 * It used to refuse every edit instead, although the outer gate was already held.
 * Without Web Locks, refused coordination fails before invoking the operation.
 * Callbacks must stay synchronous; awaiting would outlive the IndexedDB lock.
 */
export async function withProfileRosterLock<T>(
  operation: SynchronousOperation<T>,
  failure: T,
): Promise<T> {
  try {
    if (typeof window === "undefined" || typeof navigator === "undefined") return failure;
    if (navigator.locks) {
      return await navigator.locks.request(
        PROFILE_ROSTER_LOCK,
        { mode: "exclusive" },
        () => withIndexedDbGateUnderWebLock(operation),
      );
    }
    if (!hasIndexedDb()) return failure;
    return await withIndexedDbLock(operation);
  } catch (error) {
    console.error("Error updating profiles:", error);
    return failure;
  }
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

/**
 * The inner IndexedDB gate, taken while the Web Lock is held. Falls back to the
 * Web Lock alone only when IndexedDB refused before the operation ran: an
 * operation that started and failed is never run a second time.
 */
async function withIndexedDbGateUnderWebLock<T>(operation: () => T): Promise<T> {
  if (!hasIndexedDb()) return operation();
  const attempt = { started: false };
  try {
    return await withIndexedDbLock(operation, attempt);
  } catch (error) {
    if (attempt.started) throw error;
    console.error("IndexedDB coordination is unavailable; using Web Locks alone:", error);
    return operation();
  }
}

function withIndexedDbLock<T>(
  operation: () => T,
  attempt: { started: boolean } = { started: false },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const refuse = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const opening = indexedDB.open(LOCK_DATABASE, 1);
    opening.onupgradeneeded = () => {
      try {
        opening.result.createObjectStore(LOCK_STORE);
      } catch (error) {
        refuse(error);
        abortTransaction(opening.transaction);
      }
    };
    opening.onerror = () => refuse(opening.error);
    opening.onblocked = () => refuse(new Error("Profile storage coordination is blocked"));
    opening.onsuccess = () => {
      const database = opening.result;
      if (settled) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      database.onclose = () => refuse(new Error("Profile storage coordination was closed"));

      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(LOCK_STORE, "readwrite");
        transaction.oncomplete = () => database.close();
        transaction.onabort = () => {
          database.close();
          refuse(transaction.error ?? new Error("Profile storage coordination was aborted"));
        };
        const request = transaction.objectStore(LOCK_STORE).get(PROFILE_ROSTER_LOCK);
        request.onerror = () => refuse(request.error);
        request.onsuccess = () => {
          if (settled) return;
          attempt.started = true;
          try {
            const result = operation();
            // localStorage has already committed. An unrelated later IDB abort
            // cannot undo it and must not turn this into a reported failure.
            settled = true;
            resolve(result);
          } catch (error) {
            refuse(error);
            abortTransaction(transaction);
          }
        };
      } catch (error) {
        database.close();
        refuse(error);
      }
    };
  });
}

function abortTransaction(transaction: IDBTransaction | null): void {
  try {
    transaction?.abort();
  } catch {
    // A callback can have already aborted the transaction. Its failure has
    // been reported; an InvalidStateError here must not escape the event handler.
  }
}
