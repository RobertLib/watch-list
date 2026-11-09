// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const postMessage = vi.fn();
const active = { postMessage };
const registration = { active };
let serviceWorker: EventTarget & {
  ready: Promise<typeof registration>;
  controller: typeof active | null;
  register: ReturnType<typeof vi.fn>;
};

// jsdom has no requestIdleCallback; this one runs only when a test says the
// browser has gone idle.
let idleCallbacks: Map<number, () => void>;
let nextIdleHandle: number;
const runIdle = () => {
  const callbacks = [...idleCallbacks.values()];
  idleCallbacks.clear();
  for (const callback of callbacks) callback();
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  navigation.pathname = "/";
  postMessage.mockClear();
  serviceWorker = Object.assign(new EventTarget(), {
    ready: Promise.resolve(registration),
    controller: active,
    register: vi.fn().mockResolvedValue(registration),
  });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  vi.spyOn(document, "readyState", "get").mockReturnValue("complete");

  idleCallbacks = new Map();
  nextIdleHandle = 1;
  Object.assign(window, {
    requestIdleCallback: vi.fn((callback: () => void) => {
      const handle = nextIdleHandle++;
      idleCallbacks.set(handle, callback);
      return handle;
    }),
    cancelIdleCallback: vi.fn((handle: number) => idleCallbacks.delete(handle)),
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "serviceWorker");
  Reflect.deleteProperty(window, "requestIdleCallback");
  Reflect.deleteProperty(window, "cancelIdleCallback");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("ServiceWorkerRegistrar", () => {
  it("precaches the first route, later Link destinations, and a new controller", async () => {
    let view: ReturnType<typeof render>;
    await act(async () => { view = render(<ServiceWorkerRegistrar />); });
    runIdle();
    expect(postMessage).toHaveBeenLastCalledWith({ type: "CACHE_PAGE", url: window.location.origin + "/" });
    expect(serviceWorker.register).toHaveBeenCalledTimes(1);

    navigation.pathname = "/watchlist";
    await act(async () => { view!.rerender(<ServiceWorkerRegistrar />); });
    runIdle();
    expect(postMessage).toHaveBeenLastCalledWith({ type: "CACHE_PAGE", url: window.location.origin + "/watchlist" });
    expect(serviceWorker.register).toHaveBeenCalledTimes(1);

    postMessage.mockClear();
    await act(async () => serviceWorker.dispatchEvent(new Event("controllerchange")));
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: "CACHE_PAGE", url: window.location.origin + "/watchlist" });
  });

  // A first visit used to wait for a click or a key press as well. A reader who
  // lost signal before touching anything was left with no offline copy.
  it("registers a first visit once the page has loaded and the browser is idle, without an interaction", async () => {
    serviceWorker.controller = null;
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    await act(async () => { render(<ServiceWorkerRegistrar />); });
    runIdle();
    expect(serviceWorker.register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    expect(serviceWorker.register).not.toHaveBeenCalled();
    runIdle();
    expect(serviceWorker.register).toHaveBeenCalledTimes(1);
    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("falls back to the next task after load where requestIdleCallback is missing", async () => {
    vi.useFakeTimers();
    Reflect.deleteProperty(window, "requestIdleCallback");
    render(<ServiceWorkerRegistrar />);
    expect(serviceWorker.register).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(serviceWorker.register).toHaveBeenCalledTimes(1);
  });

  it("stops waiting for load or idle once unmounted", async () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const beforeLoad = render(<ServiceWorkerRegistrar />);
    beforeLoad.unmount();
    window.dispatchEvent(new Event("load"));
    runIdle();

    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
    const beforeIdle = render(<ServiceWorkerRegistrar />);
    beforeIdle.unmount();
    runIdle();

    expect(serviceWorker.register).not.toHaveBeenCalled();
  });

  it("saves the current route when first activation finishes after navigation", async () => {
    let ready!: (value: typeof registration) => void;
    serviceWorker.ready = new Promise((resolve) => { ready = resolve; });
    const view = render(<ServiceWorkerRegistrar />);
    navigation.pathname = "/profile";
    view.rerender(<ServiceWorkerRegistrar />);

    await act(async () => { ready(registration); });
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: "CACHE_PAGE", url: window.location.origin + "/profile" });
  });
});
