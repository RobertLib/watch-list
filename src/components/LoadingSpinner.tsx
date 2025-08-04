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

export function LoadingCard() {
  return (
    <div
      className="w-full h-60 sm:h-72 bg-gray-700 rounded-lg animate-pulse"
      role="status"
      aria-label="Loading content card"
    >
      <span className="sr-only">Loading content...</span>
    </div>
  );
}

export function LoadingSection({
  title,
  count = 20,
}: {
  title: string;
  count?: number;
  /** @deprecated use count */
  rows?: number;
  /** @deprecated use count */
  cols?: number;
}) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-6">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {Array.from({ length: count }).map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    </section>
  );
}

export function LoadingSidebar() {
  return (
    <div className="space-y-8">
      <div className="bg-gray-800 rounded-lg p-6 shadow animate-pulse">
        <div className="h-6 bg-gray-700 rounded mb-4 w-1/2"></div>
        <div className="space-y-4">
          <div className="h-4 bg-gray-700 rounded w-1/3"></div>
          <div className="flex gap-2">
            <div className="w-8 h-8 bg-gray-700 rounded"></div>
            <div className="w-8 h-8 bg-gray-700 rounded"></div>
            <div className="w-8 h-8 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 shadow animate-pulse">
        <div className="h-6 bg-gray-700 rounded mb-4 w-1/2"></div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="h-4 bg-gray-700 rounded mb-1 w-1/3"></div>
              <div className="h-4 bg-gray-700 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
