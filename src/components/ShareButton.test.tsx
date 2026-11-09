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
    expect(screen.queryByText("Copy link")).toBeNull();
  });

  it.each(["NotAllowedError", "DataError"])(
    "offers a working copy fallback when native sharing fails with %s",
    async (name) => {
      const share = vi.fn(async () => {
        throw new DOMException("Native sharing failed", name);
      });
      const writeText = vi.fn(async () => {});
      setShare(share);
      setClipboard(writeText);
      renderButton();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Share" }));
      });

      expect(share).toHaveBeenCalledExactlyOnceWith({
        title: "Fight Club",
        url: URL_UNDER_TEST,
      });
      expect(screen.getByText("X / Twitter")).toBeDefined();
      await act(async () => {
        fireEvent.click(screen.getByText("Copy link"));
      });

      expect(writeText).toHaveBeenCalledExactlyOnceWith(URL_UNDER_TEST);
      expect(screen.getByText("Copied!")).toBeDefined();
      expect(toast.showToast).not.toHaveBeenCalled();
    },
  );

  it("offers the fallback when native sharing rejects unsupported data", async () => {
    setShare(vi.fn(async () => {
      throw new TypeError("Unsupported share data");
    }));
    renderButton();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });

    expect(screen.getByText("Copy link")).toBeDefined();
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

  it("returns focus to Share when the close button dismisses the panel", () => {
    renderButton();
    openPanel();
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();

    fireEvent.click(close);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Share" }));
  });

  it("says whether its panel is open, and which element that is", () => {
    renderButton();
    const trigger = screen.getByRole("button", { name: "Share" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.hasAttribute("aria-controls")).toBe(false);

    openPanel();

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(trigger.getAttribute("aria-controls")!);
    expect(panel?.textContent).toContain("Copy link");

    openPanel();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  /** Escape did nothing; the panel could only be left open behind you. */
  it("closes on Escape and returns focus from inside the panel to Share", () => {
    renderButton();
    openPanel();
    const copy = screen.getByRole("button", { name: "Copy link" });
    copy.focus();

    fireEvent.keyDown(copy, { key: "Escape" });

    expect(screen.queryByText("Copy link")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByRole("button", { name: "Share" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("leaves focus elsewhere on the page alone when Escape closes the panel", () => {
    renderButton();
    openPanel();
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();

    fireEvent.keyDown(other, { key: "Escape" });

    expect(screen.queryByText("Copy link")).toBeNull();
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it("ignores the Escape that ends an IME composition", () => {
    renderButton();
    openPanel();

    fireEvent.keyDown(document, { key: "Escape", isComposing: true });

    expect(screen.getByText("Copy link")).toBeDefined();
  });

  it("closes the panel on a click outside it", () => {
    renderButton();
    openPanel();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Copy link")).toBeNull();
  });
});
