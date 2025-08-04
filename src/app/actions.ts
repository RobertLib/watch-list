"use server";

import { setRegion, type Region } from "@/lib/region-server";
import { isValidRegion } from "@/lib/region";
import {
  getWatchProviderFilterCookieName,
  getSelectedProvidersCookieName,
  parseProviderIdsFromCookie,
  type WatchProviderFilter,
} from "@/lib/watch-provider-settings";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { tmdbServerApi } from "@/lib/tmdb-server";
import type { FilterOptions } from "@/types/filters";
import { submitToIndexNow, getFullUrl } from "@/lib/indexnow";

export async function changeRegion(formData: FormData) {
  const region = formData.get("region") as Region;

  if (!region || !isValidRegion(region)) {
    throw new Error("Invalid region");
  }

  await setRegion(region);

  // Mark that user has made settings (will hide welcome panel)
  const cookieStore = await cookies();
  cookieStore.set("user-has-settings", "true", {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });

  // Revalidate all pages to reflect the new region
  revalidatePath("/", "layout");

  // Also revalidate the profile page specifically
  revalidatePath("/profile");
}

export async function changeWatchProviderFilter(formData: FormData) {
  const filter = formData.get("filter") as WatchProviderFilter;

  if (!filter || (filter !== "all" && filter !== "streaming-only")) {
    throw new Error("Invalid watch provider filter");
  }

  const cookieStore = await cookies();
  cookieStore.set(getWatchProviderFilterCookieName(), filter, {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });

  // Mark that user has made settings (will hide welcome panel)
  cookieStore.set("user-has-settings", "true", {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });

  // Revalidate all pages to reflect the new filter
  revalidatePath("/", "layout");

  // Also revalidate the profile page specifically
  revalidatePath("/profile");
}

export async function changeSelectedProviders(formData: FormData) {
  const providersString = formData.get("providers") as string;

  // Validate the provider IDs
  const providerIds = parseProviderIdsFromCookie(providersString || "");
  const validatedString = providerIds.join(",");

  const cookieStore = await cookies();
  cookieStore.set(getSelectedProvidersCookieName(), validatedString, {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });

  // Mark that user has made settings (will hide welcome panel)
  cookieStore.set("user-has-settings", "true", {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });

  // Revalidate all pages to reflect the new providers
  revalidatePath("/", "layout");

  // Also revalidate the profile page specifically
  revalidatePath("/profile");
}

// Server actions for pagination
export async function getPopularMovies(page: number) {
  return await tmdbServerApi.getPopularMovies(page);
}

export async function getTopRatedMovies(page: number) {
  return await tmdbServerApi.getTopRatedMovies(page);
}

export async function getNowPlayingMovies(page: number) {
  return await tmdbServerApi.getNowPlayingMovies(page);
}

export async function getPopularTVShows(page: number) {
  return await tmdbServerApi.getPopularTVShows(page);
}

export async function getTopRatedTVShows(page: number) {
  return await tmdbServerApi.getTopRatedTVShows(page);
}

export async function getAiringTodayTVShows(page: number) {
  return await tmdbServerApi.getAiringTodayTVShows(page);
}

export async function discoverMoviesByGenre(genreId: number, page: number) {
  return await tmdbServerApi.discoverMoviesByGenre(genreId, page);
}

export async function searchMulti(query: string, page: number = 1) {
  return await tmdbServerApi.searchMulti(query, page);
}

export async function discoverTVShowsByGenre(genreId: number, page: number) {
  return await tmdbServerApi.discoverTVShowsByGenre(genreId, page);
}

// New filtered discovery actions
export async function discoverMoviesWithFilters(
  page: number,
  filters: FilterOptions
) {
  return await tmdbServerApi.discoverMovies(page, filters);
}

export async function discoverTVShowsWithFilters(
  page: number,
  filters: FilterOptions
) {
  return await tmdbServerApi.discoverTVShows(page, filters);
}

// Check if user has custom settings
export async function hasUserCustomSettings(): Promise<boolean> {
  const cookieStore = await cookies();

  // Check if user has explicitly interacted with settings
  const hasSettingsCookie = cookieStore.get("user-has-settings");
  if (hasSettingsCookie) {
    return true;
  }

  // Check if user has set a custom region (not default US)
  const regionCookie = cookieStore.get("tmdb-region");
  const hasCustomRegion = regionCookie && regionCookie.value !== "US";

  // Check if user has set watch provider filter to streaming-only
  const watchProviderCookie = cookieStore.get(
    getWatchProviderFilterCookieName()
  );
  const hasCustomWatchProvider =
    watchProviderCookie && watchProviderCookie.value === "streaming-only";

  return Boolean(hasCustomRegion || hasCustomWatchProvider);
}

// IndexNow server actions
export async function submitUrlsToIndexNow(
  urls: string | string[]
): Promise<boolean> {
  try {
    return await submitToIndexNow(urls);
  } catch (error) {
    console.error("Failed to submit URLs to IndexNow:", error);
    return false;
  }
}

export async function submitPathToIndexNow(path: string): Promise<boolean> {
  try {
    const fullUrl = getFullUrl(path);
    return await submitToIndexNow([fullUrl]);
  } catch (error) {
    console.error("Failed to submit path to IndexNow:", error);
    return false;
  }
}

export async function notifyIndexNowOfUpdate(path?: string): Promise<boolean> {
  try {
    // If no path provided, submit the homepage
    const pathToSubmit = path || "/";
    return await submitPathToIndexNow(pathToSubmit);
  } catch (error) {
    console.error("Failed to notify IndexNow of update:", error);
    return false;
  }
}
