export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Hero skeleton */}
      <div className="relative overflow-hidden bg-gray-950">
        <div className="relative container mx-auto px-4 py-12 max-w-6xl">
          <div className="flex items-center gap-8">
            {/* Profile photo */}
            <div className="w-32 h-48 md:w-40 md:h-60 shrink-0 bg-gray-800 rounded-xl animate-pulse" />

            <div className="space-y-3">
              <div className="h-3 bg-gray-700 rounded w-40 animate-pulse" />
              <div className="h-9 bg-gray-700 rounded w-56 animate-pulse" />
              <div className="h-4 bg-gray-700 rounded w-28 animate-pulse" />
              <div className="flex gap-2 mt-1">
                <div className="h-7 bg-gray-700 rounded-full w-24 animate-pulse" />
                <div className="h-7 bg-gray-700 rounded-full w-28 animate-pulse" />
                <div className="h-7 bg-gray-700 rounded-full w-20 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Heading */}
        <div className="h-9 bg-gray-700 rounded w-44 mb-2 animate-pulse" />
        <div className="h-4 bg-gray-700 rounded w-72 mb-6 animate-pulse" />

        {/* Filter tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          {[64, 80, 96, 104].map((w, i) => (
            <div
              key={i}
              className="h-9 bg-gray-800 rounded-full animate-pulse"
              style={{ width: `${w}px` }}
            />
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-2/3 bg-gray-800 rounded-lg mb-3" />
              <div className="h-4 bg-gray-700 rounded mb-1" />
              <div className="h-3 bg-gray-700 rounded w-2/3 mb-1" />
              <div className="h-3 bg-gray-700 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
