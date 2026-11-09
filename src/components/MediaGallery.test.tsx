// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MediaGallery } from "./MediaGallery";
import type { TMDBImage } from "@/types/tmdb";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

const backdrops: TMDBImage[] = [1, 2, 3].map((id) => ({
  file_path: `/backdrop-${id}.jpg`,
  width: 1920,
  height: 1080,
  vote_average: 0,
  vote_count: 0,
  iso_639_1: null,
}));

function openGallery(images = backdrops, startIndex = 0) {
  const view = render(
    <MediaGallery backdrops={images} posters={[]} title="Arrival" />,
  );
  const opener = screen.getByRole("button", {
    name: `Arrival — image ${startIndex + 1}`,
  });
  // Keyboard activation of a native button dispatches a click. jsdom does not
  // implement that browser default, so focus it before dispatching the click.
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole("dialog", {
    name: "Arrival image gallery",
  });
  return { ...view, dialog, opener };
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("MediaGallery keyboard navigation", () => {
  it("moves focus from the activated thumbnail into a named modal dialog", () => {
    const { dialog, opener } = openGallery(backdrops, 1);

    expect(opener.getAttribute("aria-haspopup")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Close" }),
    );
    expect(
      within(dialog).getByRole("img", { name: "Arrival — image 2" }),
    ).toBeTruthy();
  });

  it("wraps Tab and Shift+Tab across the dialog controls", () => {
    const { dialog } = openGallery();
    const close = within(dialog).getByRole("button", { name: "Close" });
    const next = within(dialog).getByRole("button", { name: "Next" });

    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(next);

    fireEvent.keyDown(next, { key: "Tab" });
    expect(document.activeElement).toBe(close);
  });

  it("keeps focus inside a gallery containing a single image", () => {
    const { dialog, opener } = openGallery(backdrops.slice(0, 1));
    const close = within(dialog).getByRole("button", { name: "Close" });

    expect(within(dialog).queryByRole("button", { name: "Next" })).toBeNull();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);

    opener.focus();
    fireEvent.keyDown(opener, { key: "Tab" });
    expect(document.activeElement).toBe(close);
  });

  it("closes on Escape and restores focus to the thumbnail that opened it", () => {
    const { opener } = openGallery(backdrops, 2);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });

  it("navigates images with arrow keys, wraps both ways, and keeps focus", () => {
    const { dialog } = openGallery();
    const close = within(dialog).getByRole("button", { name: "Close" });

    fireEvent.keyDown(close, { key: "ArrowLeft" });
    expect(
      within(dialog).getByRole("img", { name: "Arrival — image 3" }),
    ).toBeTruthy();

    fireEvent.keyDown(close, { key: "ArrowRight" });
    expect(
      within(dialog).getByRole("img", { name: "Arrival — image 1" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(close);
  });

  it("preserves focus and the original scroll state across parent renders", () => {
    document.body.style.overflow = "auto";
    const { dialog, rerender, opener } = openGallery();
    const previous = within(dialog).getByRole("button", { name: "Previous" });
    previous.focus();
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<MediaGallery backdrops={backdrops} posters={[]} title="Arrival" />);
    expect(document.activeElement).toBe(previous);

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(opener);
  });

  it("keeps the dialog open when an image is clicked and closes on its backdrop", () => {
    const { dialog, opener } = openGallery();

    fireEvent.click(
      within(dialog).getByRole("img", { name: "Arrival — image 1" }),
    );
    expect(screen.getByRole("dialog")).toBe(dialog);

    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("restores an existing scroll lock when the gallery unmounts", () => {
    document.body.style.overflow = "hidden";
    const { unmount } = openGallery();

    unmount();

    expect(document.body.style.overflow).toBe("hidden");
  });
});

const posters: TMDBImage[] = [1, 2].map((id) => ({
  file_path: `/poster-${id}.jpg`,
  width: 1000,
  height: 1500,
  vote_average: 0,
  vote_count: 0,
  iso_639_1: null,
}));

function sizeOf(image: HTMLElement): string | undefined {
  return image.getAttribute("data-src")?.match(/\/t\/p\/([^/]+)\//)?.[1];
}

/**
 * The two sets are toggles, and the only sign of which one was showing used to
 * be its colour – a screen reader announced two plain buttons.
 */
describe("MediaGallery backdrop and poster toggles", () => {
  it("says which set is showing", () => {
    render(<MediaGallery backdrops={backdrops} posters={posters} title="Arrival" />);
    const group = screen.getByRole("group", { name: "Image type" });
    const backdropToggle = within(group).getByRole("button", { name: /Backdrops/ });
    const posterToggle = within(group).getByRole("button", { name: /Posters/ });

    expect(backdropToggle.getAttribute("aria-pressed")).toBe("true");
    expect(posterToggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(posterToggle);

    expect(backdropToggle.getAttribute("aria-pressed")).toBe("false");
    expect(posterToggle.getAttribute("aria-pressed")).toBe("true");
  });
});

/**
 * `next.config.ts` sets `unoptimized`, so the size named is the size
 * downloaded. The grid asked for `w780` for tiles a few hundred pixels wide,
 * and the lightbox for `original` – a 4K file per arrow press.
 */
describe("MediaGallery image sizes", () => {
  it("fetches grid tiles at a size near their own", () => {
    render(<MediaGallery backdrops={backdrops} posters={posters} title="Arrival" />);
    expect(sizeOf(screen.getByRole("img", { name: "Arrival — image 1" }))).toBe("w500");

    fireEvent.click(screen.getByRole("button", { name: /Posters/ }));
    expect(sizeOf(screen.getByRole("img", { name: "Arrival — image 1" }))).toBe("w300");
  });

  it("opens backdrops at w1280 and posters at w780 rather than the original", () => {
    const { dialog } = openGallery();
    expect(sizeOf(within(dialog).getByRole("img", { name: "Arrival — image 1" }))).toBe("w1280");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(sizeOf(within(dialog).getByRole("img", { name: "Arrival — image 2" }))).toBe("w1280");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    cleanup();

    render(<MediaGallery backdrops={[]} posters={posters} title="Arrival" />);
    fireEvent.click(screen.getByRole("button", { name: "Arrival — image 2" }));
    const posterDialog = screen.getByRole("dialog", { name: "Arrival image gallery" });
    expect(sizeOf(within(posterDialog).getByRole("img", { name: "Arrival — image 2" }))).toBe("w780");
  });
});
