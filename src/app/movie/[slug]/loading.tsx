export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Hero Section Skeleton */}
      <div className="relative">
        {/* Backdrop placeholder */}
        <div className="absolute inset-0 z-0">
          <div className="w-full h-full bg-gray-800 animate-pulse"></div>
          <div className="absolute inset-0 bg-black/60" />
        </div>

        <div className="relative z-10 container mx-auto px-4 py-8">
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl">
            {/* Poster Skeleton */}
            <div className="md:col-span-1">
              <div className="relative aspect-2/3 w-full max-w-sm mx-auto bg-gray-700 rounded-lg animate-pulse"></div>
            </div>

            {/* Movie Info Skeleton */}
            <div className="md:col-span-2 text-white">
              {/* Title */}
              <div className="h-12 md:h-14 bg-gray-700 rounded w-3/4 mb-2 animate-pulse"></div>

              {/* Tagline */}
              <div className="h-6 bg-gray-700 rounded w-1/2 mb-4 animate-pulse"></div>

              {/* Movie metadata (year, runtime, rating) */}
              <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="h-5 bg-gray-700 rounded w-16 animate-pulse"></div>
                <div className="h-5 bg-gray-700 rounded w-2 animate-pulse"></div>
                <div className="h-5 bg-gray-700 rounded w-20 animate-pulse"></div>
                <div className="h-5 bg-gray-700 rounded w-2 animate-pulse"></div>
                <div className="flex items-center gap-2">
                  <div className="h-5 bg-gray-700 rounded w-6 animate-pulse"></div>
                  <div className="h-5 bg-gray-700 rounded w-8 animate-pulse"></div>
                  <div className="h-5 bg-gray-700 rounded w-24 animate-pulse"></div>
                </div>
              </div>

              {/* Genre tags */}
              <div className="flex gap-2 mb-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-6 bg-gray-700 rounded-full w-16 animate-pulse"
                  ></div>
                ))}
              </div>

              {/* Overview section */}
              <div className="mt-6">
                <div className="h-6 bg-gray-700 rounded w-24 mb-3 animate-pulse"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-700 rounded w-full animate-pulse"></div>
                  <div className="h-4 bg-gray-700 rounded w-5/6 animate-pulse"></div>
                  <div className="h-4 bg-gray-700 rounded w-4/5 animate-pulse"></div>
                </div>
              </div>

              {/* Key Crew */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="h-5 bg-gray-700 rounded w-16 mb-1 animate-pulse"></div>
                  <div className="h-4 bg-gray-700 rounded w-24 animate-pulse"></div>
                </div>
                <div>
                  <div className="h-5 bg-gray-700 rounded w-16 mb-1 animate-pulse"></div>
                  <div className="h-4 bg-gray-700 rounded w-32 animate-pulse"></div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-5 mt-6">
                <div className="h-12 bg-gray-700 rounded w-32 animate-pulse"></div>
                <div className="h-12 bg-gray-700 rounded w-40 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Section Skeleton */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-12">
            {/* Main Cast Section */}
            <section>
              <div className="h-8 bg-gray-700 rounded w-32 mb-6 animate-pulse"></div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="text-center animate-pulse">
                    <div className="relative aspect-2/3 mb-3 bg-gray-700 rounded-lg"></div>
                    <div className="h-4 bg-gray-700 rounded w-full mb-1"></div>
                    <div className="h-3 bg-gray-700 rounded w-3/4 mx-auto"></div>
                  </div>
                ))}
              </div>
            </section>

            {/* Similar Movies Section */}
            <section>
              <div className="h-8 bg-gray-700 rounded w-40 mb-6 animate-pulse"></div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-gray-700 rounded-lg aspect-2/3 mb-3"></div>
                    <div className="h-4 bg-gray-700 rounded mb-2"></div>
                    <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Watch Providers */}
            <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
              <div className="h-6 bg-gray-700 rounded w-32 mb-4"></div>
              <div className="space-y-4">
                <div>
                  <div className="h-4 bg-gray-700 rounded w-16 mb-2"></div>
                  <div className="flex gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-12 h-12 bg-gray-700 rounded"
                      ></div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="h-4 bg-gray-700 rounded w-16 mb-2"></div>
                  <div className="flex gap-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-12 h-12 bg-gray-700 rounded"
                      ></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Language Support */}
            <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
              <div className="h-6 bg-gray-700 rounded w-36 mb-4"></div>
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-4 bg-gray-700 rounded w-full"></div>
                ))}
              </div>
            </div>

            {/* Movie Information */}
            <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
              <div className="h-6 bg-gray-700 rounded w-40 mb-4"></div>
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i}>
                    <div className="h-4 bg-gray-700 rounded w-1/3 mb-1"></div>
                    <div className="h-4 bg-gray-700 rounded w-2/3"></div>
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
