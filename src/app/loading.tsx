import { CarouselSkeleton, HeroSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <HeroSkeleton gradientFrom="from-black" />

      <div className="container mx-auto px-6 lg:px-8 py-8 space-y-12">
        {/* Welcome Panel Skeleton */}
        <div className="bg-linear-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-lg p-6 animate-pulse">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 bg-gray-700 rounded-full"></div>
            <div>
              <div className="h-6 bg-gray-700 rounded w-32 mb-2"></div>
              <div className="h-4 bg-gray-700 rounded w-48"></div>
            </div>
          </div>
          <div className="space-y-2 mb-6">
            <div className="h-4 bg-gray-700 rounded w-full"></div>
            <div className="h-4 bg-gray-700 rounded w-3/4"></div>
          </div>
        </div>

        {/* Carousels Skeletons */}
        <CarouselSkeleton titleWidth="w-48" />
        <CarouselSkeleton titleWidth="w-64" />
        <CarouselSkeleton titleWidth="w-48" />
        <CarouselSkeleton titleWidth="w-52" />
        <CarouselSkeleton titleWidth="w-56" />
      </div>
    </>
  );
}
