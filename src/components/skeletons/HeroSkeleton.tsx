interface HeroSkeletonProps {
  gradientFrom?: string;
}

/**
 * Reusable skeleton component for hero sections
 */
export function HeroSkeleton({
  gradientFrom = "from-gray-900",
}: HeroSkeletonProps) {
  return (
    <div className="relative h-[50vh] sm:h-[60vh] lg:h-[70vh] bg-gray-800 animate-pulse">
      <div
        className={`absolute inset-0 bg-linear-to-t ${gradientFrom} via-gray-900/50 to-transparent`}
      />
      <div className="absolute inset-0 flex items-center py-4 sm:py-6">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="space-y-3 sm:space-y-4 lg:space-y-6 max-w-2xl">
            <div className="h-8 sm:h-10 lg:h-12 bg-gray-700 rounded w-3/4" />
            <div className="h-4 sm:h-5 lg:h-6 bg-gray-700 rounded w-full" />
            <div className="h-4 sm:h-5 lg:h-6 bg-gray-700 rounded w-2/3" />
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-4">
              <div className="h-10 sm:h-12 bg-gray-700 rounded w-full sm:w-32" />
              <div className="h-10 sm:h-12 bg-gray-700 rounded w-full sm:w-32" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
