// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShareListButton } from "./ShareListButton";
import type { SharedListRef } from "@/lib/shared-list";

const items: SharedListRef[] = [{ id: 550, mediaType: "movie" }];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function titleInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Name it (optional)" }) as HTMLInputElement;
}

function sharedTitle(): string | null {
  const input = screen.getByRole("textbox", { name: "Share link" }) as HTMLInputElement;
  return new URL(input.value).searchParams.get("t");
}

function openAt(viewportWidth: number, anchorLeft: number) {
  render(<ShareListButton items={items} defaultTitle="My watchlist" />);
  const button = screen.getByRole("button", { name: "Share" });
  const anchor = button.parentElement as HTMLDivElement;
  let width = viewportWidth;
  let left = anchorLeft;
  vi.spyOn(document.documentElement, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this === anchor
      ? new DOMRect(left, 100, 88, 40)
      : new DOMRect(0, 0, Math.min(320, width - 32), 200);
  });

  fireEvent.click(button);
  const panel = screen.getByRole("textbox", { name: "Share link" })
    .parentElement?.parentElement as HTMLDivElement;
  return {
    panel,
    resize(nextWidth: number, nextAnchorLeft: number) {
      width = nextWidth;
      left = nextAnchorLeft;
      fireEvent(window, new Event("resize"));
    },
  };
}

describe("ShareListButton", () => {
  it("returns focus to Share when the Close button dismisses its panel", () => {
    render(<ShareListButton items={items} defaultTitle="My watchlist" />);
    const trigger = screen.getByRole("button", { name: "Share" });
    fireEvent.click(trigger);
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();

    fireEvent.click(close);

    expect(screen.queryByRole("textbox", { name: "Share link" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it.each(["title", "default title", "items"])("stops confirming a copied URL when the %s changes", async (change) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { rerender } = render(<ShareListButton items={items} defaultTitle="Old name" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const originalUrl = (screen.getByRole("textbox", { name: "Share link" }) as HTMLInputElement).value;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy link" })); });
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();

    if (change === "title") {
      fireEvent.change(titleInput(), { target: { value: "New name" } });
    } else {
      rerender(<ShareListButton
        items={change === "items" ? [{ id: 949, mediaType: "movie" }] : items}
        defaultTitle={change === "default title" ? "New name" : "Old name"}
      />);
    }

    expect((screen.getByRole("textbox", { name: "Share link" }) as HTMLInputElement).value)
      .not.toBe(originalUrl);
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(originalUrl);
  });

  it("does not confirm the current URL when an older clipboard write finishes late", async () => {
    let completeCopy!: () => void;
    const pendingCopy = new Promise<void>((resolve) => { completeCopy = resolve; });
    const writeText = vi.fn().mockReturnValue(pendingCopy);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ShareListButton items={items} defaultTitle="Old name" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const originalUrl = (screen.getByRole("textbox", { name: "Share link" }) as HTMLInputElement).value;
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    fireEvent.change(titleInput(), { target: { value: "New name" } });

    await act(async () => { completeCopy(); await pendingCopy; });

    expect(writeText).toHaveBeenCalledExactlyOnceWith(originalUrl);
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });

  it("confirms a changed URL after copying it and keeps the full renewed timeout", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ShareListButton items={items} defaultTitle="Old name" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy link" })); });
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.change(titleInput(), { target: { value: "New name" } });
    const currentUrl = (screen.getByRole("textbox", { name: "Share link" }) as HTMLInputElement).value;

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy link" })); });
    act(() => { vi.advanceTimersByTime(1001); });

    expect(writeText).toHaveBeenLastCalledWith(currentUrl);
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(999); });
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  });

  it.each(["Name it (optional)", "Share link"])("returns focus from %s to the trigger on Escape", (label) => {
    render(<ShareListButton items={items} defaultTitle="My watchlist" />);
    const trigger = screen.getByRole("button", { name: "Share" });
    fireEvent.click(trigger);
    const input = screen.getByRole("textbox", { name: label });
    input.focus();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: label })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("points its trigger at the open panel", () => {
    render(<ShareListButton items={items} defaultTitle="My watchlist" />);
    const trigger = screen.getByRole("button", { name: "Share" });
    expect(trigger.hasAttribute("aria-controls")).toBe(false);

    fireEvent.click(trigger);

    const panel = document.getElementById(trigger.getAttribute("aria-controls")!);
    expect(panel?.contains(screen.getByRole("textbox", { name: "Share link" }))).toBe(true);
  });

  it("keeps the panel open for the Escape that cancels an IME composition", () => {
    render(<ShareListButton items={items} defaultTitle="My watchlist" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const input = screen.getByRole("textbox", { name: "Name it (optional)" });
    input.focus();

    fireEvent.keyDown(input, { key: "Escape", isComposing: true });

    expect(screen.getByRole("textbox", { name: "Name it (optional)" })).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it("returns focus to the owner when Escape dismisses several share panels", () => {
    render(<>
      <ShareListButton items={items} defaultTitle="First list" />
      <ShareListButton items={items} defaultTitle="Second list" />
    </>);
    const triggers = screen.getAllByRole("button", { name: "Share" });
    for (const trigger of triggers) fireEvent.click(trigger);
    const input = screen.getAllByRole("textbox", { name: "Name it (optional)" })[1];
    input.focus();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryAllByRole("textbox", { name: "Name it (optional)" })).toHaveLength(0);
    expect(document.activeElement).toBe(triggers[1]);
  });

  it("labels each panel independently when multiple shares are opened by keyboard", () => {
    render(<>
      <ShareListButton items={items} defaultTitle="First list" />
      <ShareListButton items={items} defaultTitle="Second list" />
    </>);
    // Keyboard activation fires click without the pointer's mousedown that
    // normally dismisses the other panel.
    for (const button of screen.getAllByRole("button", { name: "Share" })) {
      fireEvent.click(button);
    }

    const titles = screen.getAllByRole("textbox", {
      name: "Name it (optional)",
    }) as HTMLInputElement[];
    const links = screen.getAllByRole("textbox", {
      name: "Share link",
    }) as HTMLInputElement[];
    expect(titles).toHaveLength(2);
    expect(links).toHaveLength(2);
    expect(new Set([...titles, ...links].map((input) => input.id)).size).toBe(4);
    for (const input of [...titles, ...links]) {
      expect(input.labels).toHaveLength(1);
      expect(input.labels![0].control).toBe(input);
    }

    fireEvent.change(titles[1], { target: { value: "Second list renamed" } });
    expect(titles[0].value).toBe("First list");
    expect(new URL(links[0].value).searchParams.get("t")).toBe("First list");
    expect(new URL(links[1].value).searchParams.get("t")).toBe("Second list renamed");
  });

  it.each([
    { viewport: 375, anchorLeft: 16, expectedLeft: 16 },
    { viewport: 375, anchorLeft: 350, expectedLeft: 39 },
    { viewport: 1280, anchorLeft: 1000, expectedLeft: 768 },
    { viewport: 280, anchorLeft: 16, expectedLeft: 16 },
  ])("keeps the panel inside a $viewport px viewport at anchor $anchorLeft", ({ viewport, anchorLeft, expectedLeft }) => {
    const { panel } = openAt(viewport, anchorLeft);
    const left = anchorLeft + Number.parseFloat(panel.style.left);
    const right = left + panel.getBoundingClientRect().width;

    expect(left).toBe(expectedLeft);
    expect(left).toBeGreaterThanOrEqual(16);
    expect(right).toBeLessThanOrEqual(viewport - 16);
    expect(panel.style.right).toBe("auto");
  });

  it("repositions an open panel after the viewport and anchor change", () => {
    const { panel, resize } = openAt(1280, 1000);
    resize(375, 16);

    expect(panel.style.left).toBe("0px");
    expect(16 + panel.getBoundingClientRect().width).toBeLessThanOrEqual(375 - 16);
  });

  it("updates an untouched title when the list name changes", () => {
    const { rerender } = render(<ShareListButton items={items} defaultTitle="Old name" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    rerender(<ShareListButton items={items} defaultTitle="New name" />);

    expect(titleInput().value).toBe("New name");
    expect(sharedTitle()).toBe("New name");
  });

  it.each(["My own share title", ""])("preserves a custom title across a rename and reopening (%j)", (customTitle) => {
    const { rerender } = render(<ShareListButton items={items} defaultTitle="Old name" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.change(titleInput(), { target: { value: customTitle } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    rerender(<ShareListButton items={items} defaultTitle="New name" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(titleInput().value).toBe(customTitle);
    expect(sharedTitle()).toBe(customTitle || null);
  });

  it("follows the list name again when a custom title is reset to the default", () => {
    const { rerender } = render(<ShareListButton items={items} defaultTitle="Old name" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.change(titleInput(), { target: { value: "My own share title" } });
    fireEvent.change(titleInput(), { target: { value: "Old name" } });
    rerender(<ShareListButton items={items} defaultTitle="New name" />);

    expect(titleInput().value).toBe("New name");
    expect(sharedTitle()).toBe("New name");
  });
});
