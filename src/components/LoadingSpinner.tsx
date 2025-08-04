export function LoadingSpinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"
        aria-hidden="true"
      ></div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/**
 * One pulsing placeholder tile.
 *
 * Deliberately carries no ARIA of its own. It used to be a `role="status"` live
 * region announcing "Loading content..." – per card, twenty cards to a section
 * and up to thirteen sections to a page, which came to 260 live regions in the
 * markup of /movies alone. A screen reader read the same sentence 260 times for
 * one page load. The announcement belongs to the section, once; the tiles are
 * decoration and are hidden from the accessibility tree by the grid below.
 */
function LoadingCard() {
  return (
    <div className="w-full h-60 sm:h-72 bg-gray-700 rounded-lg animate-pulse" />
  );
}

export function LoadingSection({
  title,
  count = 20,
}: {
  /** Omitted where the skeleton stands in for a section that has no heading. */
  title?: string;
  count?: number;
}) {
  return (
    <section className="mb-12" role="status">
      {/* Rendered only when there is one. An unconditional `<h2>{title}</h2>`
          with `title=""` emitted an empty heading, which is a WCAG failure and
          shows up as one in every audit. */}
      {title && <h2 className="text-2xl font-bold mb-6">{title}</h2>}

      <span className="sr-only">Loading content...</span>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6"
        aria-hidden="true"
      >
        {Array.from({ length: count }).map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    </section>
  );
}
