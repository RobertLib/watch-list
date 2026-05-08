import Image from "next/image";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { createSlug } from "@/lib/utils";
import type { Credits } from "@/types/tmdb";

interface TVCastProps {
  credits: Credits;
}

function TVCastContent({ credits }: TVCastProps) {
  const mainCast = credits.cast.slice(0, 12);

  if (mainCast.length === 0) {
    return null;
  }

  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-6">Main Cast</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {mainCast.map((actor, index) => (
          <Link
            key={actor.id}
            href={`/person/${createSlug(actor.name, actor.id)}`}
            className="text-center group block"
          >
            <div className="relative aspect-2/3 mb-3 overflow-hidden rounded-lg">
              <Image
                src={tmdbApi.getImageUrl(actor.profile_path, "w500")}
                alt={actor.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-200"
                loading={index < 4 ? "eager" : "lazy"}
              />
            </div>
            <h3 className="font-semibold text-sm text-white group-hover:text-blue-400 transition-colors">
              {actor.name}
            </h3>
            <p className="text-gray-300 text-sm">{actor.character}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function TVCast({ credits }: TVCastProps) {
  return <TVCastContent credits={credits} />;
}
