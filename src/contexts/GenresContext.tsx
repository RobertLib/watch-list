"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { Genre } from "@/types/tmdb";

interface GenresContextType {
  movieGenres: Genre[];
  tvGenres: Genre[];
  loading: boolean;
}

const GenresContext = createContext<GenresContextType>({
  movieGenres: [],
  tvGenres: [],
  loading: true,
});

export const useGenres = () => {
  const context = useContext(GenresContext);
  if (!context) {
    throw new Error("useGenres must be used within a GenresProvider");
  }
  return context;
};

interface GenresProviderProps {
  children: ReactNode;
}

export function GenresProvider({ children }: GenresProviderProps) {
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTvGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGenres = async () => {
      try {
        const response = await fetch("/api/genres");
        if (!response.ok) {
          throw new Error("Failed to fetch genres");
        }

        const data = await response.json();
        setMovieGenres(data.movieGenres);
        setTvGenres(data.tvGenres);
      } catch (error) {
        console.error("Error fetching genres:", error);
        // Set empty arrays on error
        setMovieGenres([]);
        setTvGenres([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGenres();
  }, []);

  return (
    <GenresContext.Provider value={{ movieGenres, tvGenres, loading }}>
      {children}
    </GenresContext.Provider>
  );
}
