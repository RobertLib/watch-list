export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="h-8 bg-gray-700 rounded w-56 mb-3 animate-pulse"></div>
        <div className="h-4 bg-gray-700 rounded w-80 animate-pulse"></div>
      </div>

      <div className="h-6 bg-gray-700 rounded w-40 mb-4 animate-pulse"></div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 p-3 rounded-xl bg-gray-900/60 border border-gray-800"
          >
            <div className="w-32 aspect-video rounded-lg bg-gray-700 animate-pulse"></div>
            <div className="flex-1 self-center space-y-2">
              <div className="h-3 bg-gray-700 rounded w-32 animate-pulse"></div>
              <div className="h-4 bg-gray-700 rounded w-48 animate-pulse"></div>
              <div className="h-3 bg-gray-700 rounded w-40 animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
