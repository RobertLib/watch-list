"use client";

import { useEffect, useState } from "react";
import { useSettings } from "./useSettings";
import { getRegionCode } from "@/lib/region";
import { getStreamingProviders } from "@/lib/streaming-providers";

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
 * The platforms the filter bar can offer, split into the visitor's own and the
 * rest. Both halves used to come from an API route because the saved platforms
 * sat in an httpOnly cookie; they are a local-storage read now, so the only
 * thing left to wait for is TMDB's list for the region.
 */
export function useStreamingProviders(): StreamingProvidersState {
  const { region, selectedProviderIds } = useSettings();
  const regionCode = getRegionCode(region);
  const selectedKey = selectedProviderIds.join(",");

  const [state, setState] = useState<StreamingProvidersState>({
    ...EMPTY_STATE,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const selected = new Set(
      selectedKey ? selectedKey.split(",").map(Number) : [],
    );

    async function loadProviders() {
      try {
        const providers = await getStreamingProviders(regionCode);
        if (cancelled) return;

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
  }, [regionCode, selectedKey]);

  return state;
}
