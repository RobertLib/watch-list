// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { DailyArchiveGrid } from "./DailyArchiveGrid";
import { DailyGameTeaser } from "./DailyGameTeaser";
import { puzzleNumberForDay } from "@/lib/daily-puzzle";

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const components = [
  {
    name: "archive",
    Component: DailyArchiveGrid,
    todayText: (day: string) => `${day} · Today`,
  },
  {
    name: "home-page teaser",
    Component: DailyGameTeaser,
    todayText: (day: string) => `#${puzzleNumberForDay(day)}`,
  },
];

describe.each(components)("daily dates in the $name", ({ Component, todayText }) => {
  it("hydrates an export built on an earlier day without replacing its tree", async () => {
    vi.setSystemTime(new Date("2026-10-05T10:00:00.000Z"));
    const html = renderToString(<Component />);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);

    vi.setSystemTime(new Date("2026-10-06T10:00:00.000Z"));
    const onRecoverableError = vi.fn();
    const view = render(<Component />, {
      container,
      hydrate: true,
      onRecoverableError,
    });
    await act(async () => {});

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain(todayText("2026-10-06"));
  });

  it("updates the visible day when UTC midnight passes", async () => {
    vi.setSystemTime(new Date("2026-10-05T23:59:59.000Z"));
    const view = render(<Component />);
    expect(view.container.textContent).toContain(todayText("2026-10-05"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(view.container.textContent).toContain(todayText("2026-10-06"));
    expect(view.container.textContent).not.toContain(todayText("2026-10-05"));
  });

  it("updates after a suspended tab becomes visible on a later day", () => {
    vi.setSystemTime(new Date("2026-10-05T10:00:00.000Z"));
    const view = render(<Component />);

    vi.setSystemTime(new Date("2026-10-07T10:00:00.000Z"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(view.container.textContent).toContain(todayText("2026-10-07"));
    expect(view.container.textContent).not.toContain(todayText("2026-10-05"));
  });
});
