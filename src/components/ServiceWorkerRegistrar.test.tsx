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
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "serviceWorker");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ServiceWorkerRegistrar", () => {
  it("precaches the first route, later Link destinations, and a new controller", async () => {
    let view: ReturnType<typeof render>;
    await act(async () => { view = render(<ServiceWorkerRegistrar />); });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "CACHE_PAGE", url: window.location.origin + "/" });
    expect(serviceWorker.register).toHaveBeenCalledTimes(1);

    navigation.pathname = "/watchlist";
    await act(async () => { view!.rerender(<ServiceWorkerRegistrar />); });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "CACHE_PAGE", url: window.location.origin + "/watchlist" });
    expect(serviceWorker.register).toHaveBeenCalledTimes(1);

    postMessage.mockClear();
    await act(async () => serviceWorker.dispatchEvent(new Event("controllerchange")));
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: "CACHE_PAGE", url: window.location.origin + "/watchlist" });
  });

  it("waits for a first visitor's first interaction before registering", async () => {
    serviceWorker.controller = null;
    await act(async () => { render(<ServiceWorkerRegistrar />); });
    window.dispatchEvent(new Event("scroll"));
    expect(serviceWorker.register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("keydown"));
    expect(serviceWorker.register).toHaveBeenCalledTimes(1);
    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("stops waiting for an interaction once unmounted", async () => {
    serviceWorker.controller = null;
    const view = render(<ServiceWorkerRegistrar />);
    view.unmount();
    window.dispatchEvent(new Event("keydown"));
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
