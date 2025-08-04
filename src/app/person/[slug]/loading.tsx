export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Breadcrumb skeleton */}
        <div className="h-5 bg-gray-700 rounded w-48 mb-6 animate-pulse" />

        <div className="grid md:grid-cols-3 gap-8 mt-6">
          {/* Sidebar */}
          <div className="md:col-span-1">
            <div className="relative aspect-2/3 w-full max-w-sm mx-auto mb-6 bg-gray-700 rounded-lg animate-pulse" />
            <div className="bg-gray-800 rounded-lg p-4 space-y-3">
              <div className="h-5 bg-gray-700 rounded w-1/2 animate-pulse" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  <div className="h-3 bg-gray-700 rounded w-1/3 mb-1 animate-pulse" />
                  <div className="h-4 bg-gray-600 rounded w-2/3 animate-pulse" />
                </div>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div className="md:col-span-2">
            <div className="h-12 bg-gray-700 rounded w-3/4 mb-4 animate-pulse" />
            <div className="space-y-2 mb-8">
              {[90, 100, 95, 88, 100, 92].map((w, i) => (
                <div
                  key={i}
                  className="h-4 bg-gray-700 rounded animate-pulse"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
            <div className="h-8 bg-gray-700 rounded w-32 mb-4 animate-pulse" />
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-2/3 bg-gray-700 rounded-lg mb-2 animate-pulse" />
                  <div className="h-3 bg-gray-700 rounded mb-1 animate-pulse" />
                  <div className="h-3 bg-gray-700 rounded w-2/3 animate-pulse" />
                </div>
              ))}
            </div>

            {/* Filmography */}
            <div className="mt-8">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="h-7 bg-gray-700 rounded w-36 animate-pulse" />
                <div className="flex gap-2">
                  <div className="h-8 bg-gray-700 rounded w-20 animate-pulse" />
                  <div className="h-8 bg-gray-700 rounded w-24 animate-pulse" />
                  <div className="h-8 bg-gray-700 rounded w-20 animate-pulse" />
                </div>
              </div>
              <div className="space-y-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 animate-pulse"
                  >
                    <div className="w-10 h-14 bg-gray-700 rounded shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-700 rounded w-3/4" />
                      <div className="h-3 bg-gray-700 rounded w-1/3" />
                    </div>
                    <div className="h-4 bg-gray-700 rounded w-8 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
