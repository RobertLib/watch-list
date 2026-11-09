// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LoadFailureNotice } from "./LoadFailureNotice";

afterEach(cleanup);

// The full-size notice is the whole page when a detail page fails – and it
// gave that page no h1, so a screen reader landed with no heading to orient by.
it("heads a full page with an h1", () => {
  render(<LoadFailureNotice title="Could not load this film" />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Could not load this film" }),
  ).toBeTruthy();
});

it("is an h2 when compact, inside a page with a heading of its own", () => {
  render(<LoadFailureNotice title="Could not load movies" compact />);

  expect(
    screen.getByRole("heading", { level: 2, name: "Could not load movies" }),
  ).toBeTruthy();
});

// /tonight and /calendar render the full-size notice under their own h1.
it("steps down to an h2 when the page already has its h1", () => {
  render(
    <LoadFailureNotice title="Could not load your calendar" headingLevel={2} />,
  );

  expect(
    screen.getByRole("heading", { level: 2, name: "Could not load your calendar" }),
  ).toBeTruthy();
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
});

it("offers a retry only when given one", () => {
  const onRetry = vi.fn();
  const { rerender } = render(<LoadFailureNotice />);
  expect(screen.queryByRole("button")).toBeNull();

  rerender(<LoadFailureNotice onRetry={onRetry} />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledOnce();
});
