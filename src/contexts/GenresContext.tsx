"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { tmdbApi } from "@/lib/tmdb";
import { Genre } from "@/types/tmdb";

interface GenresContextType {
  movieGenres: Genre[];
  tvGenres: Genre[];
  loading: boolean;
  movieFailed: boolean;
  tvFailed: boolean;
  /** Load missing lists, or retry the ones that failed. Successful lists stay cached. */
  requestGenres: () => void;
}

interface GenresContextValue extends GenresContextType {
  registerConsumer: () => () => void;
}

// `undefined` rather than a filled-in default: a default object is truthy, so
// the guard in `useGenres` could never fire, and a component rendered outside
// the provider would sit at `loading: true` for ever instead of saying so.
const GenresContext = createContext<GenresContextValue | undefined>(undefined);

export const useGenres = () => {
  const context = useContext(GenresContext);
  if (context === undefined) {
    throw new Error("useGenres must be used within a GenresProvider");
  }

  // Asking for the lists is what starts the fetch. The provider wraps the whole
  // app, so fetching on *its* mount spent two TMDB requests on every page –
  // including /about, /profile and /offline, which never name a genre.
  const { registerConsumer } = context;
  useEffect(registerConsumer, [registerConsumer]);

  return context;
};

interface GenresProviderProps {
  children: ReactNode;
}

/**
 * A failed list settles, but remains eligible for retry. Keeping readiness
 * separately for each type avoids discarding or re-fetching the successful half.
 */
type GenresStatus = "idle" | "loading" | "ready" | "failed";

interface GenresState {
  status: GenresStatus;
  movieGenres: Genre[];
  tvGenres: Genre[];
  movieReady: boolean;
  tvReady: boolean;
  movieFailed: boolean;
  tvFailed: boolean;
}

const INITIAL_STATE: GenresState = {
  status: "idle",
  movieGenres: [],
  tvGenres: [],
  movieReady: false,
  tvReady: false,
  movieFailed: false,
  tvFailed: false,
};

export function GenresProvider({ children }: GenresProviderProps) {
  const [state, setState] = useState<GenresState>(INITIAL_STATE);
  const activeConsumers = useRef(0);
  const { status, movieReady, tvReady } = state;

  // Stable: updating the result does not re-run every consumer's mount effect
  // and turn a service outage into a continuous retry loop.
  const requestGenres = useCallback(() => {
    setState((current) =>
      current.status === "idle" || current.status === "failed"
        ? { ...current, status: "loading" }
        : current,
    );
  }, []);

  const registerConsumer = useCallback(() => {
    activeConsumers.current += 1;
    requestGenres();
    return () => {
      activeConsumers.current -= 1;
    };
  }, [requestGenres]);

  useEffect(() => {
    const onOnline = () => {
      // The layout survives navigation. Reconnecting on /about or /profile
      // should not start requests for something that page does not use.
      if (activeConsumers.current > 0) requestGenres();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [requestGenres]);

  useEffect(() => {
    if (status !== "loading") return;

    let cancelled = false;

    const fetchGenres = async () => {
      const [movies, tv] = await Promise.allSettled([
        movieReady ? Promise.resolve(null) : tmdbApi.getMovieGenres(),
        tvReady ? Promise.resolve(null) : tmdbApi.getTVGenres(),
      ]);
      if (cancelled) return;

      // A malformed successful response is also retryable; it must not become
      // a permanently cached empty list or put undefined into consumers' state.
      const movieGenres = movies.status === "fulfilled" && Array.isArray(movies.value?.genres)
        ? movies.value.genres : null;
      const tvGenres = tv.status === "fulfilled" && Array.isArray(tv.value?.genres)
        ? tv.value.genres : null;
      const movieFailed = !movieReady && movieGenres === null;
      const tvFailed = !tvReady && tvGenres === null;

      for (const [type, result, failed] of [
        ["movie", movies, movieFailed],
        ["TV", tv, tvFailed],
      ] as const) {
        if (failed) {
          console.error(`Error fetching ${type} genres:`, result.status === "rejected"
            ? result.reason : new Error("Invalid genre list response"));
        }
      }

      setState((current) => ({
        status: movieFailed || tvFailed ? "failed" : "ready",
        movieGenres: movieGenres ?? current.movieGenres,
        tvGenres: tvGenres ?? current.tvGenres,
        movieReady: movieReady || movieGenres !== null,
        tvReady: tvReady || tvGenres !== null,
        movieFailed,
        tvFailed,
      }));
    };

    fetchGenres();

    return () => {
      cancelled = true;
    };
  }, [status, movieReady, tvReady]);

  const value = useMemo<GenresContextValue>(
    () => ({
      movieGenres: state.movieGenres,
      tvGenres: state.tvGenres,
      // `idle` reads as loading too: a consumer sets it to `loading` from the
      // effect after its first render, and it must not be told in between that
      // the lists are simply empty.
      loading: status === "idle" || status === "loading",
      movieFailed: state.movieFailed,
      tvFailed: state.tvFailed,
      requestGenres,
      registerConsumer,
    }),
    [state, status, requestGenres, registerConsumer],
  );

  return (
    <GenresContext.Provider value={value}>{children}</GenresContext.Provider>
  );
}
