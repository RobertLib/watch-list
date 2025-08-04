import { LoadingSection } from "@/components/LoadingSpinner";

function PageHeroSkeleton({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="relative h-[40vh] sm:h-[45vh] lg:h-[50vh] bg-gray-800">
      <div className="absolute inset-0 bg-linear-to-t from-black via-black/50 to-transparent" />
      <div className="absolute inset-0 flex items-center py-4 sm:py-6">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="space-y-3 sm:space-y-4 max-w-2xl">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
              {title}
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-200 leading-relaxed max-w-xl">
              {description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-black">
      <PageHeroSkeleton
        title="TV Shows"
        description="Discover the latest and greatest TV shows"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <LoadingSection title="Discover TV Shows" rows={2} cols={6} />
        <LoadingSection title="Popular TV Shows" rows={2} cols={6} />
        <LoadingSection title="Top Rated TV Shows" rows={2} cols={6} />
        <LoadingSection title="Airing Today" rows={2} cols={6} />
      </div>
    </div>
  );
}
