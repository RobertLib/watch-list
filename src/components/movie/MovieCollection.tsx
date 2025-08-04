import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { tmdbApi } from "@/lib/tmdb";
import { createSlug } from "@/lib/utils";
import type { MovieCollection as MovieCollectionType } from "@/types/tmdb";

interface MovieCollectionProps {
  collection: MovieCollectionType;
}

export function MovieCollection({ collection }: MovieCollectionProps) {
  const href = `/collection/${createSlug(collection.name, collection.id)}`;

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4 text-white">
        Part of a Collection
      </h2>
      <Link href={href} className="block group">
        <div className="relative rounded-xl overflow-hidden">
          {collection.backdrop_path ? (
            <div className="relative h-40 sm:h-52 w-full">
              <Image
                src={tmdbApi.getImageUrl(collection.backdrop_path, "w1280")}
                alt={collection.name}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
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
            <div className="flex-1">
              <p className="text-gray-300 text-sm uppercase tracking-wider mb-1">
                Collection
              </p>
              <h3 className="text-white text-xl sm:text-2xl font-bold">
                {collection.name}
              </h3>
              <p className="text-blue-400 text-sm mt-2 flex items-center gap-1 group-hover:underline">
                View all films
                <ChevronRight className="w-4 h-4" />
              </p>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
