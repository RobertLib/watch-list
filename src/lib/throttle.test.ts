import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { throttle } from "./throttle";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("throttle", () => {
  it("runs the first call straight away", () => {
    const spy = vi.fn();
    throttle(spy, 100)("first");

    expect(spy).toHaveBeenCalledExactlyOnceWith("first");
  });

  it("defers a call inside the window instead of dropping it", () => {
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    throttled("first");
    throttled("second");
    expect(spy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith("second");
  });

  it("keeps only the last of a burst", () => {
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    throttled("first");
    throttled("a");
    throttled("b");
    throttled("last");

    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith("last");
  });

  it("cancel stops the trailing call", () => {
    // The reason `cancel` exists: an effect's cleanup removes the listener, but
    // the call already scheduled would still land in an unmounted component.
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    throttled("first");
    throttled("trailing");
    throttled.cancel();

    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledExactlyOnceWith("first");
  });

  it("is usable again after being cancelled", () => {
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    throttled("first");
    throttled("dropped");
    throttled.cancel();

    vi.advanceTimersByTime(1000);
    throttled("later");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith("later");
  });

  it("cancel is safe with nothing pending", () => {
    const throttled = throttle(vi.fn(), 100);
    expect(() => {
      throttled.cancel();
      throttled.cancel();
    }).not.toThrow();
  });
});
