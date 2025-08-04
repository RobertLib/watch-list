import { vi } from "vitest";

/** A transient failure after hydration, without preventing a later retry. */
export function refuseNextLocalStorageRead(key: string) {
  const getItem = Storage.prototype.getItem;
  let pending = true;
  return vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
    this: Storage,
    requestedKey: string,
  ) {
    if (pending && this === window.localStorage && requestedKey === key) {
      pending = false;
      throw new DOMException("Storage read refused", "SecurityError");
    }
    return getItem.call(this, requestedKey);
  });
}
