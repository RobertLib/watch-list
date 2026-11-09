// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PersonGrid } from "./PersonGrid";
import type { Person } from "@/types/tmdb";

/**
 * In the search overlay `onSelect` closes the overlay and drops the query. A
 * person opened in a new tab leaves this page where it was, so only the plain
 * click that navigates this tab may close it.
 */

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

afterEach(() => cleanup());

const people = [
  { id: 31, name: "Tom Hanks", profile_path: null, known_for_department: "Acting" } as Person,
];

describe("choosing a person", () => {
  it("tells the owner about a plain click", () => {
    const onSelect = vi.fn();
    render(<PersonGrid people={people} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("link"));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Cmd", { metaKey: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Shift", { shiftKey: true }],
  ])("leaves the owner alone on a %s-click", (_, modifier) => {
    const onSelect = vi.fn();
    render(<PersonGrid people={people} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("link"), modifier);

    expect(onSelect).not.toHaveBeenCalled();
  });
});
