"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useIndexNow, UseIndexNowReturn } from "@/hooks/useIndexNow";

interface IndexNowContextType extends UseIndexNowReturn {
  /**
   * Submit a movie page to IndexNow
   */
  submitMoviePage: (movieId: number, slug: string) => Promise<boolean>;

  /**
   * Submit a TV show page to IndexNow
   */
  submitTVShowPage: (tvId: number, slug: string) => Promise<boolean>;

  /**
   * Submit multiple pages at once
   */
  submitPages: (paths: string[]) => Promise<boolean>;
}

const IndexNowContext = createContext<IndexNowContextType | undefined>(
  undefined
);

interface IndexNowProviderProps {
  children: ReactNode;
}

export function IndexNowProvider({ children }: IndexNowProviderProps) {
  const { submitUrls, submitCurrentPage, submitPath } = useIndexNow();

  const submitMoviePage = async (
    movieId: number,
    slug: string
  ): Promise<boolean> => {
    const path = `/movie/${slug}`;
    return submitPath(path);
  };

  const submitTVShowPage = async (
    tvId: number,
    slug: string
  ): Promise<boolean> => {
    const path = `/tv/${slug}`;
    return submitPath(path);
  };

  const submitPages = async (paths: string[]): Promise<boolean> => {
    if (typeof window === "undefined") return false;

    const fullUrls = paths.map((path) =>
      new URL(path, window.location.origin).toString()
    );

    return submitUrls(fullUrls);
  };

  const value: IndexNowContextType = {
    submitUrls,
    submitCurrentPage,
    submitPath,
    submitMoviePage,
    submitTVShowPage,
    submitPages,
  };

  return (
    <IndexNowContext.Provider value={value}>
      {children}
    </IndexNowContext.Provider>
  );
}

export function useIndexNowContext(): IndexNowContextType {
  const context = useContext(IndexNowContext);
  if (context === undefined) {
    throw new Error(
      "useIndexNowContext must be used within an IndexNowProvider"
    );
  }
  return context;
}
