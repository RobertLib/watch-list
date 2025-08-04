/**
 * The rate limiter for the two event streams that would otherwise re-render on
 * every frame: window resize and carousel scroll.
 *
 * It returns a function carrying a `cancel`. That is not a convenience – it is
 * what makes them safe to use from an effect. A trailing call is by definition
 * scheduled for *after* the event that triggered it, so removing the listener in
 * a cleanup does not stop the last one: it still fires, into a component that
 * has since unmounted. A listing page mounts one throttle per card, so a resize
 * just before navigating away leaves a timer per card, each with a closure over
 * that card's state. Every caller must cancel on unmount.
 */

/** A rate-limited function, and the way to call off whatever it has pending. */
export interface Cancellable<T extends unknown[]> {
  (...args: T): void;
  cancel: () => void;
}

/**
 * Run `func` at most once per `delay`, leading edge first.
 *
 * A call that arrives inside the window is not dropped – it is deferred to the
 * end of it, so the final resize of a drag is the one that decides the layout.
 */
export function throttle<T extends unknown[]>(
  func: (...args: T) => unknown,
  delay: number,
): Cancellable<T> {
  // `setTimeout` here is the browser's, which answers with a number rather than
  // the Node handle the ambient @types/node would otherwise infer.
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastExecTime = 0;

  const throttled = (...args: T) => {
    const currentTime = Date.now();
    const elapsed = currentTime - lastExecTime;

    if (elapsed > delay) {
      lastExecTime = currentTime;
      func(...args);
      return;
    }

    if (timeoutId) clearTimeout(timeoutId);

    timeoutId = setTimeout(() => {
      timeoutId = null;
      lastExecTime = Date.now();
      func(...args);
    }, delay - elapsed);
  };

  throttled.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
  };

  return throttled;
}
