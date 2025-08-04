import { cookies } from "next/headers";
import {
  getWatchProviderFilterCookieName,
  type WatchProviderFilter,
} from "./watch-provider-settings";

/**
 * Get the current watch provider filter setting from cookies (server-side only)
 */
export async function getWatchProviderFilter(): Promise<WatchProviderFilter> {
  const cookieStore = await cookies();
  const filter = cookieStore.get(getWatchProviderFilterCookieName())?.value;

  return filter === "streaming-only" ? "streaming-only" : "all";
}
