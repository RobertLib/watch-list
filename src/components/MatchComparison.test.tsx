// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { buildMatchPath, matchLists } from "@/lib/list-match";
import { decodeSharedList, type SharedListRef } from "@/lib/shared-list";
import type { MediaItem } from "@/types/tmdb";
import { CompareWithMineButton } from "./CompareWithMineButton";
import { MatchStarter } from "./MatchStarter";
import { MatchContent } from "./MatchContent";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
let query = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));
vi.mock("@/hooks/useSettings", () => ({ useSettingsKey: () => "" }));
vi.mock("@/lib/shared-list-data", () => ({
  getSharedListResolution: async (refs: SharedListRef[]) => ({
    items: refs.map((ref) => ({
      id: ref.id,
      title: `Title ${ref.id}`,
      media_type: ref.mediaType,
    })),
    failedRefs: [],
  }),
}));
vi.mock("@/components/MediaGrid", () => ({
  MediaGrid: ({ items }: { items: MediaItem[] }) => (
    <div>{items.map((item) => <p key={`${item.media_type}-${item.id}`}>{item.title}</p>)}</div>
  ),
}));

const mine: SharedListRef[] = Array.from({ length: 61 }, (_, index) => ({
  id: index + 1,
  mediaType: "movie",
}));
const theirs: SharedListRef[] = [{ id: 61, mediaType: "movie" }];

beforeEach(() => {
  query = "";
  push.mockClear();
  window.localStorage.clear();
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(mine.map((ref) => ({
    ...ref,
    title: `Title ${ref.id}`,
    posterPath: null,
    releaseDate: "2020-01-01",
    voteAverage: 8,
    addedAt: "2026-10-05T10:00:00.000Z",
  }))));
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function sharedFromNavigation() {
  const path = push.mock.calls[0][0] as string;
  const params = new URLSearchParams(path.split("?")[1]);
  return matchLists(decodeSharedList(params.get("mine")!), decodeSharedList(params.get("theirs")!)).shared;
}

describe("whole-watchlist comparisons", () => {
  it("includes later local titles from Compare with mine", () => {
    render(<WatchlistProvider><CompareWithMineButton items={theirs} /></WatchlistProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Compare with mine" }));

    expect(sharedFromNavigation()).toEqual(theirs);
  });

  it("includes later local titles when submitting a friend's link", () => {
    render(<WatchlistProvider><MatchStarter /></WatchlistProvider>);
    fireEvent.change(screen.getByRole("textbox", { name: "Paste their share link" }), {
      target: { value: "https://watch-list.test/list?items=m61" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));

    expect(sharedFromNavigation()).toEqual(theirs);
  });

  it("warns about the share-link cap instead of hiding it by pre-truncating the list", () => {
    render(<WatchlistProvider><MatchStarter /></WatchlistProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(screen.getByText("Only the first 60 titles fit in a link.")).toBeDefined();
    expect(screen.getByText(/comparisons here check your whole watchlist/)).toBeDefined();
  });

  it("renders later shared titles and explains the shortened unique-title section", async () => {
    query = buildMatchPath(mine, theirs).split("?")[1];
    render(<MatchContent />);

    expect(await screen.findByText("Title 61")).toBeDefined();
    expect(screen.getByText("1 title you have both saved. Start there.")).toBeDefined();
    expect(screen.getByRole("note").textContent).toContain("some titles unique to your list are omitted");
  });
});
