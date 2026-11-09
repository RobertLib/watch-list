/**
 * Whether a click on a link is the one that navigates this tab.
 *
 * A link's own `onClick` runs for every click on it – Next's `Link` calls it
 * before deciding whether to navigate – including Cmd/Ctrl-click (a new tab),
 * Shift-click (a new window) and Alt-click (a download), all of which leave
 * this page exactly where it is. Housekeeping that belongs to *leaving* the
 * page – closing the search overlay and throwing its query away, say – must
 * run only for the click that actually leaves; otherwise opening a result in a
 * background tab wipes out the results the visitor meant to come back to.
 *
 * The same test `next/link` applies (`isModifiedEvent`), so the two agree on
 * which clicks are a navigation. A middle click never reaches `onClick` – it is
 * an `auxclick` – but the button is checked anyway.
 */
export function isPlainPrimaryClick(
  event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
