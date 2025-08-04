"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { tmdbApi } from "@/lib/tmdb";
import { Genre } from "@/types/tmdb";

interface GenresContextType {
  movieGenres: Genre[];
  tvGenres: Genre[];
  loading: boolean;
  /** Called by `useGenres` on mount – see the provider. */
  requestGenres: () => void;
}

// `undefined` rather than a filled-in default: a default object is truthy, so
// the guard in `useGenres` could never fire, and a component rendered outside
// the provider would sit at `loading: true` for ever instead of saying so.
const GenresContext = createContext<GenresContextType | undefined>(undefined);

export const useGenres = () => {
  const context = useContext(GenresContext);
  if (context === undefined) {
    throw new Error("useGenres must be used within a GenresProvider");
  }

  // Asking for the lists is what starts the fetch. The provider wraps the whole
  // app, so fetching on *its* mount spent two TMDB requests on every page –
  // including /about, /profile and /offline, which never name a genre.
  const { requestGenres } = context;
  useEffect(() => {
    requestGenres();
  }, [requestGenres]);

  return context;
};

interface GenresProviderProps {
  children: ReactNode;
}

/**
 * `idle` until a consumer asks, then `loading`, then `ready` – whether or not
 * the lists came back with anything in them. A boolean could not express the
 * last part: a failed fetch answers with two empty lists, and "empty" has to
 * settle rather than read as "still loading" for the rest of the session.
 */
type GenresStatus = "idle" | "loading" | "ready";

export function GenresProvider({ children }: GenresProviderProps) {
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTvGenres] = useState<Genre[]>([]);
  const [status, setStatus] = useState<GenresStatus>("idle");

  // Stable, and idempotent after the first call, so every consumer calling this
  // on mount still costs exactly one fetch.
  const requestGenres = useCallback(() => {
    setStatus((current) => (current === "idle" ? "loading" : current));
  }, []);

  useEffect(() => {
    if (status !== "loading") return;

    let cancelled = false;

    const fetchGenres = async () => {
      try {
        const [movies, tv] = await Promise.all([
          tmdbApi.getMovieGenres(),
          tmdbApi.getTVGenres(),
        ]);
        if (cancelled) return;

        // A 200 carrying an unexpected body would otherwise put `undefined` into
        // state, and every consumer maps over these lists.
        setMovieGenres(Array.isArray(movies?.genres) ? movies.genres : []);
        setTvGenres(Array.isArray(tv?.genres) ? tv.genres : []);
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching genres:", error);
        // Set empty arrays on error
        setMovieGenres([]);
        setTvGenres([]);
      } finally {
        if (!cancelled) setStatus("ready");
      }
    };

    fetchGenres();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const value = useMemo<GenresContextType>(
    () => ({
      movieGenres,
      tvGenres,
      // `idle` reads as loading too: a consumer sets it to `loading` from the
      // effect after its first render, and it must not be told in between that
      // the lists are simply empty.
      loading: status !== "ready",
      requestGenres,
    }),
    [movieGenres, tvGenres, status, requestGenres],
  );

  return (
    <GenresContext.Provider value={value}>{children}</GenresContext.Provider>
  );
}
