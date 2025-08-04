// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShareButton } from "./ShareButton";

/**
 * The share panel, and the copy button underneath it.
 *
 * What is pinned here is the failure. `navigator.clipboard` is undefined outside
 * a secure context and the write can be refused even on HTTPS, and this button
 * used to assume neither ever happens – so a refusal became an unhandled
 * rejection in the console and, on screen, a button that did nothing at all when
 * pressed. Nothing about that is visible in a passing render test, which is why
 * the refusal path gets its own cases here rather than a comment.
 *
 * The native sheet is the other branch worth holding: where it exists the panel
 * must not open behind it, and a dismissed sheet is somebody changing their
 * mind rather than an error to report.
 */

vi.mock("./Toast", () => ({
  toast: { showToast: vi.fn() },
}));

const { toast } = await import("./Toast");

const URL_UNDER_TEST = "https://watch-list.me/movie?id=550";

function renderButton() {
  return render(<ShareButton title="Fight Club" url={URL_UNDER_TEST} />);
}

/** Open the fallback panel, which is what appears where there is no share sheet. */
function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
}

function setClipboard(writeText: ((text: string) => Promise<void>) | null) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
    writable: true,
  });
}

function setShare(share: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  setShare(undefined);
  setClipboard(async () => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ShareButton", () => {
  it("opens the fallback panel where there is no native share sheet", () => {
    renderButton();

    expect(screen.queryByText("Copy link")).toBeNull();
    openPanel();
    expect(screen.getByText("Copy link")).toBeDefined();
  });

  it("offers the social links with the url encoded into them", () => {
    renderButton();
    openPanel();

    const x = screen.getByText("X / Twitter").closest("a");
    expect(x?.getAttribute("href")).toContain(encodeURIComponent(URL_UNDER_TEST));
    // A share link opening a new tab must not hand it a live `window.opener`.
    expect(x?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("uses the native sheet instead of the panel when there is one", async () => {
    const share = vi.fn(async () => {});
    setShare(share);
    renderButton();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });

    expect(share).toHaveBeenCalledWith({
      title: "Fight Club",
      url: URL_UNDER_TEST,
    });
    expect(screen.queryByText("Copy link")).toBeNull();
  });

  it("treats a dismissed share sheet as a change of mind, not an error", async () => {
    setShare(vi.fn(async () => {
      throw new DOMException("Share canceled", "AbortError");
    }));
    renderButton();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });

    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("copies the link and confirms it", async () => {
    const writeText = vi.fn(async () => {});
    setClipboard(writeText);
    renderButton();
    openPanel();

    await act(async () => {
      fireEvent.click(screen.getByText("Copy link"));
    });

    expect(writeText).toHaveBeenCalledWith(URL_UNDER_TEST);
    expect(screen.getByText("Copied!")).toBeDefined();
  });

  /** The bug: a refused write used to escape as an unhandled rejection. */
  it("says so when the clipboard refuses the write", async () => {
    setClipboard(async () => {
      throw new DOMException("Write permission denied.", "NotAllowedError");
    });
    renderButton();
    openPanel();

    await act(async () => {
      fireEvent.click(screen.getByText("Copy link"));
    });

    expect(toast.showToast).toHaveBeenCalledWith(
      "Could not copy the link",
      "error",
    );
    // And the button does not claim a success it did not have.
    expect(screen.queryByText("Copied!")).toBeNull();
  });

  /** `navigator.clipboard` is simply absent outside a secure context. */
  it("says so when there is no clipboard at all", async () => {
    setClipboard(null);
    renderButton();
    openPanel();

    await act(async () => {
      fireEvent.click(screen.getByText("Copy link"));
    });

    expect(toast.showToast).toHaveBeenCalledWith(
      "Could not copy the link",
      "error",
    );
  });

  it("closes the panel on the close button", () => {
    renderButton();
    openPanel();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByText("Copy link")).toBeNull();
  });

  it("closes the panel on a click outside it", () => {
    renderButton();
    openPanel();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Copy link")).toBeNull();
  });
});
