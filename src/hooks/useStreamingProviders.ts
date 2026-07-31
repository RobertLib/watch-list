"use client";

import { useEffect, useState } from "react";

export interface StreamingProviderOption {
  provider_id: number;
  provider_name: string;
}

interface StreamingProvidersState {
  /** Platforms available in the visitor's region, most popular first. */
  providers: StreamingProviderOption[];
  /** Platforms saved in the profile, narrowed to what the region offers. */
  myProviders: StreamingProviderOption[];
  /** Everything else the region offers. */
  otherProviders: StreamingProviderOption[];
  isLoading: boolean;
}

const EMPTY_STATE: StreamingProvidersState = {
  providers: [],
  myProviders: [],
  otherProviders: [],
  isLoading: false,
};

/**
 * The platforms the filter bar can offer. The saved ones live in an httpOnly
 * cookie, so both lists have to come from the API route instead of being read
 * here; the region is taken from the cookie by that route as well.
 */
export function useStreamingProviders(): StreamingProvidersState {
  const [state, setState] = useState<StreamingProvidersState>({
    ...EMPTY_STATE,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      try {
        const response = await fetch("/api/streaming-providers");
        if (!response.ok) {
          throw new Error("Failed to fetch providers");
        }
        const data = await response.json();
        if (cancelled) return;

        const providers: StreamingProviderOption[] = data.providers ?? [];
        const selected = new Set<number>(data.selected ?? []);

        setState({
          providers,
          myProviders: providers.filter((provider) =>
            selected.has(provider.provider_id),
          ),
          otherProviders: providers.filter(
            (provider) => !selected.has(provider.provider_id),
          ),
          isLoading: false,
        });
      } catch (error) {
        if (cancelled) return;
        // A missing list only costs the platform options, so the rest of the
        // filter bar keeps working.
        console.error("Error fetching streaming providers:", error);
        setState(EMPTY_STATE);
      }
    }

    loadProviders();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
