import { LoadingSection } from "@/components/LoadingSpinner";

function PageHeroSkeleton() {
  return (
    <div className="relative h-[40vh] sm:h-[45vh] lg:h-[50vh] bg-gray-800">
      <div className="absolute inset-0 bg-linear-to-t from-black via-black/50 to-transparent" />
      <div className="absolute inset-0 flex items-center py-4 sm:py-6">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="space-y-3 sm:space-y-4 max-w-2xl">
            <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
              Movies
            </div>
            <p className="text-base sm:text-lg lg:text-xl text-gray-200 leading-relaxed max-w-xl">
              Discover the latest and greatest movies
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscoverMoviesSkeleton() {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold text-white mb-4">Discover Movies</h2>
      <div className="space-y-6 mb-8">
        {/* Quick Filters */}
        <div className="bg-gray-900/50 rounded-lg p-6">
          <div className="h-5 bg-gray-700 rounded w-28 mb-4 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-4 rounded-lg border-2 border-gray-700 bg-gray-800/50 space-y-2 animate-pulse"
              >
                <div className="h-4 bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-700 rounded w-full" />
              </div>
            ))}
          </div>
        </div>
        {/* Advanced Filters toggle */}
        <div className="bg-gray-900/50 rounded-lg p-4">
          <div className="h-5 bg-gray-700 rounded w-56 animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="w-full h-60 sm:h-72 bg-gray-700 rounded-lg animate-pulse"
          />
        ))}
      </div>
    </section>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-black">
      <PageHeroSkeleton />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <DiscoverMoviesSkeleton />
        <LoadingSection title="Popular Movies" />
        <LoadingSection title="Top Rated Movies" />
        <LoadingSection title="Now Playing" />
      </div>
    </div>
  );
}
