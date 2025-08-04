/** A shared browser lock manager; separate module instances share this origin. */
export function createProfileLockManager() {
  const pending = new Map<string, Promise<unknown>>();
  return {
    request<T>(
      name: string,
      options: LockOptions,
      operation: (lock: Lock) => T | PromiseLike<T>,
    ): Promise<T> {
      const result = (pending.get(name) ?? Promise.resolve()).then(() => operation({
        name,
        mode: options.mode ?? "exclusive",
      } as Lock));
      pending.set(name, result.then(() => {}, () => {}));
      return result;
    },
  };
}
