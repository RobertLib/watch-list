export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <div className="h-8 bg-gray-700 rounded w-40 mb-2 animate-pulse"></div>
          <div className="h-4 bg-gray-700 rounded w-32 animate-pulse"></div>
        </div>
        <div className="h-10 bg-gray-700 rounded w-24 animate-pulse"></div>
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="relative group animate-pulse">
            <div className="bg-gray-700 rounded-lg aspect-2/3 mb-3"></div>
            <div className="h-4 bg-gray-700 rounded mb-2"></div>
            <div className="h-3 bg-gray-700 rounded w-1/2 mb-1"></div>
            <div className="flex items-center gap-1">
              <div className="h-3 bg-gray-700 rounded w-3"></div>
              <div className="h-3 bg-gray-700 rounded w-8"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
