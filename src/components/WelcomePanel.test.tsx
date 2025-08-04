// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WelcomePanel } from "./WelcomePanel";

/**
 * The first-run panel: what it announces itself as, and how it gets out of the
 * way.
 *
 * Both were wrong in ways that pass every build. It claimed `role="banner"` –
 * the landmark for the site's own header – from inside `<main>`, where that is
 * either dropped or simply untrue. And it closed itself by dispatching a
 * synthetic `storage` event, which reached every real storage listener in the
 * app and was ignored by each of them only because a hand-made event has no
 * `key` to compare.
 */

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("what it announces itself as", () => {
  /**
   * A `section` carrying an accessible name is a `region` landmark already, and
   * a region is what this is: a named piece of the page, inside the main content
   * rather than standing in for the site header.
   */
  it("is a named region", () => {
    render(<WelcomePanel hasUserSettings={false} />);

    expect(
      screen.getByRole("region", { name: "Welcome to WatchList!" }),
    ).toBeDefined();
  });

  it("no longer claims to be the site banner", () => {
    render(<WelcomePanel hasUserSettings={false} />);

    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("offers a labelled way out and a way on", () => {
    render(<WelcomePanel hasUserSettings={false} />);

    expect(
      screen.getByRole("button", { name: "Close welcome panel" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Dismiss welcome panel" })).toBeDefined();
    expect(screen.getByRole("link", { name: /profile settings/i })).toBeDefined();
  });
});

describe("when it shows at all", () => {
  it("shows to somebody who has configured nothing", () => {
    render(<WelcomePanel hasUserSettings={false} />);

    expect(screen.queryByRole("region")).not.toBeNull();
  });

  it("stays away from somebody who already has settings", () => {
    render(<WelcomePanel hasUserSettings />);

    expect(screen.queryByRole("region")).toBeNull();
  });

  it("stays away once it has been dismissed before", () => {
    window.localStorage.setItem("welcome-panel-dismissed", "true");
    render(<WelcomePanel hasUserSettings={false} />);

    expect(screen.queryByRole("region")).toBeNull();
  });
});

describe("dismissing", () => {
  /**
   * The panel closes itself, so nothing external tells it to re-render. The
   * named event it now dispatches is what closes the loop – this test fails if
   * that wiring is dropped, whatever the flag in storage says.
   */
  it.each([
    ["the corner button", "Close welcome panel"],
    ["'maybe later'", "Dismiss welcome panel"],
  ])("closes it on the spot from %s", (_label, name) => {
    render(<WelcomePanel hasUserSettings={false} />);

    fireEvent.click(screen.getByRole("button", { name }));

    expect(screen.queryByRole("region")).toBeNull();
  });

  it("remembers, so it does not come back next time", () => {
    const { unmount } = render(<WelcomePanel hasUserSettings={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Close welcome panel" }));
    unmount();

    render(<WelcomePanel hasUserSettings={false} />);
    expect(screen.queryByRole("region")).toBeNull();
  });

  /**
   * The regression. Closing a banner must not look to the rest of the app like
   * somebody edited storage, or seven stores re-read themselves for it.
   */
  it("does not masquerade as a storage change", () => {
    const storageListener = vi.fn();
    window.addEventListener("storage", storageListener);

    render(<WelcomePanel hasUserSettings={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Close welcome panel" }));

    expect(storageListener).not.toHaveBeenCalled();
    window.removeEventListener("storage", storageListener);
  });
});
