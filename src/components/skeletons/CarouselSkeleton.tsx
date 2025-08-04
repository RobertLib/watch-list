interface CarouselSkeletonProps {
  titleWidth?: string;
  itemCount?: number;
}

/**
 * Reusable skeleton component for carousel loading states
 */
export function CarouselSkeleton({
  titleWidth = "w-48",
  itemCount = 6,
}: CarouselSkeletonProps) {
  return (
    <div className="space-y-4">
      <div className={`h-8 bg-gray-700 rounded ${titleWidth} animate-pulse`} />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: itemCount }).map((_, i) => (
          <div
            key={i}
            className="w-48 h-72 bg-gray-700 rounded-lg animate-pulse shrink-0"
          />
        ))}
      </div>
    </div>
  );
}
