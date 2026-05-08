import Image from "next/image";
import { tmdbApi } from "@/lib/tmdb";
import type { MovieCollection as MovieCollectionType } from "@/types/tmdb";

interface MovieCollectionProps {
  collection: MovieCollectionType;
}

export function MovieCollection({ collection }: MovieCollectionProps) {
  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4 text-white">
        Part of a Collection
      </h2>
      <div className="relative rounded-xl overflow-hidden">
        {collection.backdrop_path ? (
          <div className="relative h-40 sm:h-52 w-full">
            <Image
              src={tmdbApi.getImageUrl(collection.backdrop_path, "w1280")}
              alt={collection.name}
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-r from-black/70 via-black/40 to-transparent" />
          </div>
        ) : (
          <div className="h-40 sm:h-52 w-full bg-gray-800 rounded-xl" />
        )}
        <div className="absolute inset-0 flex items-center px-6 gap-5">
          {collection.poster_path && (
            <div className="relative w-16 h-24 shrink-0 rounded shadow-lg overflow-hidden hidden sm:block">
              <Image
                src={tmdbApi.getImageUrl(collection.poster_path, "w500")}
                alt={collection.name}
                fill
                className="object-cover"
              />
            </div>
          )}
          <div>
            <p className="text-gray-300 text-sm uppercase tracking-wider mb-1">
              Collection
            </p>
            <h3 className="text-white text-xl sm:text-2xl font-bold">
              {collection.name}
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
}
