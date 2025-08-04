import type { WatchProvider, WatchProviderData } from "@/types/tmdb";

/** Streaming includes subscriptions, free viewing and viewing with adverts. */
export const STREAMING_MONETIZATION_TYPES = "flatrate|free|ads";

/** A service may appear in several streaming categories; show its badge once. */
export function streamingProvidersFor(
  availability: WatchProviderData | undefined,
): WatchProvider[] {
  const providers = new Map<number, WatchProvider>();
  for (const provider of [
    ...(availability?.flatrate ?? []),
    ...(availability?.free ?? []),
    ...(availability?.ads ?? []),
  ]) {
    if (!providers.has(provider.provider_id)) {
      providers.set(provider.provider_id, provider);
    }
  }
  return [...providers.values()];
}
