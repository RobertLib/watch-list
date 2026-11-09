// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { VideoOverlay } from "./VideoOverlay";
import type { Video } from "@/types/tmdb";

/**
 * The trailer player, as a keyboard user meets it.
 *
 * None of this shows up in a browser with a mouse. Focus has to move into the
 * dialog when it opens, stay there while it is up, and go back to the button
 * that opened it when it closes – otherwise a trailer opened from a poster
 * leaves focus on a control hidden under the backdrop, and closing it drops the
 * visitor at the top of the document.
 *
 * The scroll lock is here too, because it shares `body.style.overflow` with the
 * search results panel and the two used to clobber each other.
 */

const trailer: Video = {
  id: "abc",
  key: "k-trailer",
  name: "Official Trailer",
  site: "YouTube",
  type: "Trailer",
  official: true,
  published_at: "2026-01-01T00:00:00.000Z",
};

function renderOverlay(
  props: Partial<React.ComponentProps<typeof VideoOverlay>> = {},
) {
  const onClose = vi.fn();
  const view = render(
    <VideoOverlay
      isOpen
      video={trailer}
      isLoading={false}
      onClose={onClose}
      {...props}
    />,
  );
  return { ...view, onClose };
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("where the overlay renders", () => {
  it("escapes its opener's stacking context and removes the portal on close", () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <div style={{ position: "relative", zIndex: 10 }}>
        <VideoOverlay isOpen video={trailer} isLoading={false} onClose={onClose} />
      </div>,
    );
    const dialog = screen.getByRole("dialog", { name: "Video: Official Trailer" });

    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Close video player" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <div style={{ position: "relative", zIndex: 10 }}>
        <VideoOverlay isOpen={false} video={trailer} isLoading={false} onClose={onClose} />
      </div>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("embeds a YouTube id, and refuses a key that would rewrite the player's URL", () => {
    const { rerender } = renderOverlay();
    expect(screen.getByTitle("Official Trailer").getAttribute("src"))
      .toBe("https://www.youtube-nocookie.com/embed/k-trailer?autoplay=1&rel=0");

    for (const key of ["videoseries?list=PL123", "../embed/other", "abc#t=1", "a%2Fb"]) {
      rerender(
        <VideoOverlay isOpen video={{ ...trailer, key }} isLoading={false} onClose={() => {}} />,
      );
      expect(document.querySelector("iframe")).toBeNull();
      expect(screen.getByText("Video is not available")).toBeTruthy();
    }
  });

  it("prerenders safely without browser globals even when marked open", () => {
    vi.stubGlobal("document", undefined);
    try {
      expect(renderToString(
        <VideoOverlay isOpen video={trailer} isLoading={false} onClose={() => {}} />,
      )).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("focus", () => {
  it("lands on the close button when the dialog opens", () => {
    renderOverlay();

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close video player" }),
    );
  });

  it("goes back to whatever opened the dialog once it closes", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { rerender } = renderOverlay();
    expect(document.activeElement).not.toBe(opener);

    rerender(
      <VideoOverlay
        isOpen={false}
        video={null}
        isLoading={false}
        onClose={() => {}}
      />,
    );

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("cycles Tab within the dialog rather than out of it", () => {
    renderOverlay();

    const close = screen.getByRole("button", { name: "Close video player" });
    const player = screen.getByTitle("Official Trailer");

    // Off the end wraps to the start …
    player.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    // … and off the start wraps to the end.
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(player);
  });

  /**
   * Once a click puts focus inside the YouTube player, its key presses stay in
   * that cross-origin frame: neither Escape nor the Tab trap above hears them.
   * Tabbing past the player's last control leaves through the browser's
   * toolbar and re-enters the page at its first link – under the backdrop. The
   * close button is where that focus is sent instead.
   */
  it("takes back focus that lands on the page underneath", () => {
    const pageLink = document.createElement("a");
    pageLink.href = "/movies";
    document.body.prepend(pageLink);
    try {
      renderOverlay();
      const close = screen.getByRole("button", { name: "Close video player" });

      act(() => pageLink.focus());

      expect(document.activeElement).toBe(close);
    } finally {
      pageLink.remove();
    }
  });

  it("leaves focus alone inside the dialog, the player included", () => {
    renderOverlay();
    const player = screen.getByTitle("Official Trailer");

    act(() => player.focus());

    expect(document.activeElement).toBe(player);
  });

  // The guard goes before the opener is refocused – or closing would hand
  // focus to the opener and the closing dialog would snatch it straight back.
  it("stops guarding once closed", () => {
    const opener = document.createElement("button");
    const elsewhere = document.createElement("button");
    document.body.append(opener, elsewhere);
    try {
      opener.focus();
      const { rerender } = renderOverlay();

      rerender(
        <VideoOverlay isOpen={false} video={null} isLoading={false} onClose={() => {}} />,
      );
      expect(document.activeElement).toBe(opener);

      act(() => elsewhere.focus());
      expect(document.activeElement).toBe(elsewhere);
    } finally {
      opener.remove();
      elsewhere.remove();
    }
  });
});

describe("closing", () => {
  it("closes on Escape", () => {
    const { onClose } = renderOverlay();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a click on the backdrop but not on the player", () => {
    const { onClose } = renderOverlay();

    fireEvent.click(screen.getByTitle("Official Trailer"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("what a screen reader is told", () => {
  it("does not embed a Vimeo key in a YouTube player", () => {
    renderOverlay({ video: { ...trailer, site: "Vimeo", key: "12345" } });

    expect(screen.queryByTitle("Official Trailer")).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/not available/i);
  });

  it("names the dialog after the video", () => {
    renderOverlay();

    expect(
      screen.getByRole("dialog", { name: "Video: Official Trailer" }),
    ).toBeTruthy();
  });

  /**
   * The name used to point at the iframe's id, and the loading and "not
   * available" branches render no iframe – a dialog labelled by an element that
   * does not exist has no name at all.
   */
  it("still has a name while loading and when nothing could be found", () => {
    const { rerender } = renderOverlay({ video: null, isLoading: true });
    expect(screen.getByRole("dialog", { name: "Video player" })).toBeTruthy();

    rerender(
      <VideoOverlay isOpen video={null} isLoading={false} onClose={() => {}} />,
    );
    expect(screen.getByRole("dialog", { name: "Video player" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/not available/i);
  });
});

describe("the scroll lock", () => {
  it("locks the page while open and releases it on close", async () => {
    const { rerender } = renderOverlay();
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => {
      rerender(
        <VideoOverlay
          isOpen={false}
          video={null}
          isLoading={false}
          onClose={() => {}}
        />,
      );
    });

    expect(document.body.style.overflow).toBe("");
  });

  /**
   * The search results panel holds the same lock. A trailer opened from those
   * results used to unlock the page underneath a panel that was still open.
   */
  it("puts back the lock it found rather than clearing it", () => {
    document.body.style.overflow = "hidden";

    const { unmount } = renderOverlay();
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("hidden");
  });
});
