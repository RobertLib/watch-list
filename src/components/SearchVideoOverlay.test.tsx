// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Navigation } from "./Navigation";
import { VideoOverlay } from "./VideoOverlay";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));
vi.mock("./WatchlistCounter", () => ({ WatchlistCounter: () => null }));
vi.mock("@/lib/api", () => ({
  searchMulti: vi.fn(async () => ({ results: [{ id: 550, title: "Fight Club" }], total_pages: 1 })),
  searchPerson: vi.fn(async () => ({ results: [] })),
}));
vi.mock("./PersonGrid", () => ({ PersonGrid: () => null }));
// The fixture supplies a poster's play control. Both layers and their keyboard,
// focus and scroll handling are the real components.
vi.mock("./MediaCarousel", () => ({ MediaCarousel: SearchTrailer }));

function SearchTrailer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Play trailer</button>
      <VideoOverlay
        isOpen={open}
        video={null}
        isLoading={false}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.style.overflow = "";
});

async function openTrailerFromSearch() {
  render(<Navigation />);
  fireEvent.click(screen.getByLabelText("Open search"));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "fight" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
  const opener = screen.getByRole("button", { name: "Play trailer" });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe("a trailer opened from search", () => {
  it("closes one layer per Escape and restores focus and scrolling", async () => {
    const opener = await openTrailerFromSearch();
    expect(screen.getByRole("dialog", { name: "Video player" })).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Video player" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Search Results" })).toBeDefined();
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("fight");
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Search Results" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
    expect(document.body.style.overflow).toBe("");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByLabelText("Open search")).toBeDefined();
  });

  it("keeps search shortcuts from stealing focus from the modal", async () => {
    await openTrailerFromSearch();
    const close = screen.getByRole("button", { name: "Close video player" });

    fireEvent.keyDown(close, { key: "/" });
    fireEvent.keyDown(close, { key: "k", ctrlKey: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(document.activeElement).toBe(close);
    expect(screen.getByRole("dialog", { name: "Video player" })).toBeDefined();
  });
});
