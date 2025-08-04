/**
 * A load that is allowed to fail on its own.
 *
 * `Promise.all` is the wrong shape for a page built out of independent
 * sections: one rejected listing takes the other four down with it, and a page
 * that could have shown four rows shows none. `Promise.allSettled` fixes that
 * but loses the tuple types, so every caller ends up unwrapping
 * `{ status, value }` by hand.
 *
 * This is the middle: a promise that resolves to `null` instead of rejecting.
 * `Promise.all` over these never rejects, and keeps the tuple typing that makes
 * `const [popular, trending] = data` mean what it reads like.
 *
 * `label` is what the console gets. It is the only record that a section is
 * missing rather than empty, so it should name the row a reader would point at.
 */
export function settle<T>(
  promise: Promise<T>,
  label: string,
): Promise<T | null> {
  return promise.then(
    (value) => value,
    (error) => {
      console.error(`Failed to load ${label}:`, error);
      return null;
    },
  );
}
