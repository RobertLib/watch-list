import { Suspense } from "react";
import Image from "next/image";
import { tmdbApi } from "@/lib/tmdb";
import { LoadingCard } from "@/components/LoadingSpinner";

interface TVCastProps {
  tvId: number;
}

async function TVCastContent({ tvId }: TVCastProps) {
  const credits = await tmdbApi.getTVShowCredits(tvId);
  const mainCast = credits.cast.slice(0, 6);

  if (mainCast.length === 0) {
    return null;
  }

  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-6">Main Cast</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {mainCast.map((actor) => (
          <div key={actor.id} className="text-center">
            <div className="relative aspect-[2/3] mb-3">
              <Image
                src={tmdbApi.getImageUrl(actor.profile_path, "w500")}
                alt={actor.name}
                fill
                className="object-cover rounded-lg"
              />
            </div>
            <h3 className="font-semibold text-sm text-white">{actor.name}</h3>
            <p className="text-gray-300 text-sm">{actor.character}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LoadingCast() {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-6">Main Cast</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    </section>
  );
}

export function TVCast({ tvId }: TVCastProps) {
  return (
    <Suspense fallback={<LoadingCast />}>
      <TVCastContent tvId={tvId} />
    </Suspense>
  );
}
