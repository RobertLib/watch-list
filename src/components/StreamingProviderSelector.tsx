"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Check, Tv, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRegionCode } from "@/lib/region";
import {
  getRegionalStreamingProviders,
  MAX_PROVIDERS_SHOWN,
  type StreamingProvider,
} from "@/lib/streaming-providers";

const POPULAR_COUNT = 7;

interface StreamingProviderSelectorProps {
  selectedProviderIds: number[];
  onUpdate: (update: (providerIds: number[]) => number[], expectedRegion: string) => void;
  region: string;
  /**
   * Unavailable while a change is being saved. Controls stay focusable and
   * refuse presses instead of using native `disabled`, which blurred the
   * platform that had just been toggled and left keyboard focus nowhere. The
   * catalogue's own reconciliation after a load is not a press, and still runs.
   */
  disabled?: boolean;
}

export function StreamingProviderSelector({
  selectedProviderIds,
  onUpdate,
  region,
  disabled = false,
}: StreamingProviderSelectorProps) {
  const [providers, setProviders] = useState<StreamingProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedRegion, setLoadedRegion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Latest props for the region effect, which must only re-run on region change
  const latestRef = useRef(onUpdate);
  useEffect(() => {
    latestRef.current = onUpdate;
  });

  // Fetch providers from API when region changes
  useEffect(() => {
    let cancelled = false;

    async function fetchProviders() {
      try {
        setIsLoading(true);
        setError(null);
        const nextProviders = await getRegionalStreamingProviders(
          getRegionCode(region),
        );
        if (cancelled) return;

        setProviders(nextProviders);

        // The region can change while this picker is hidden, or before a reload
        // retries a failed catalogue. Reconcile every successful full load,
        // including mounting again. Keep platforms below the display cutoff
        // and let the updater check the latest selection and region under lock.
        const available = new Set(
          nextProviders.map((provider) => provider.provider_id),
        );
        latestRef.current((current) => current.filter((id) => available.has(id)), region);
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching streaming providers:", err);
        setError("Failed to load streaming platforms");
      } finally {
        if (!cancelled) {
          setLoadedRegion(region);
          setIsLoading(false);
        }
      }
    }

    fetchProviders();

    return () => {
      cancelled = true;
    };
  }, [region]);

  const toggleProvider = (providerId: number) => {
    if (disabled) return;
    // Capture the displayed choice, then apply it to the latest stored list.
    // Two tabs selecting the same unchecked platform must both leave it picked.
    // Keep its region too, in case a restore changes it while the write waits.
    const wantsSelected = !selectedProviderIds.includes(providerId);
    onUpdate((current) => wantsSelected
      ? current.includes(providerId) ? current : [...current, providerId]
      : current.filter((id) => id !== providerId), region);
  };

  if (isLoading || loadedRegion !== region) {
    return (
      <div
        className="flex items-center justify-center py-12"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-3 text-gray-400">Loading platforms...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-red-400">{error}</p>
        <button
          type="button"
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (!disabled) window.location.reload();
          }}
          className="mt-4 rounded-md bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600 aria-disabled:cursor-wait aria-disabled:opacity-50"
        >
          Try Again
        </button>
      </div>
    );
  }

  const selectedCount = selectedProviderIds.length;
  // Keep saved platforms editable even when their new regional priority puts
  // them below the usual offer. Unselected options remain bounded.
  const displayedProviders = providers.filter(
    (provider, index) =>
      index < MAX_PROVIDERS_SHOWN ||
      selectedProviderIds.includes(provider.provider_id),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn(
            "text-sm",
            selectedCount === 0 ? "text-yellow-500" : "text-gray-400",
          )}
          aria-live="polite"
        >
          {selectedCount === 0
            ? "Nothing picked yet, so everything is shown"
            : `${selectedCount} platform${selectedCount !== 1 ? "s" : ""} picked`}
        </p>

        <div className="flex gap-2">
          <QuickAction
            disabled={disabled}
            onClick={() =>
              onUpdate(
                () => providers
                  .slice(0, POPULAR_COUNT)
                  .map((provider) => provider.provider_id),
                region,
              )
            }
          >
            Popular
          </QuickAction>
          <QuickAction
            disabled={disabled}
            onClick={() =>
              onUpdate(() => displayedProviders.map((provider) => provider.provider_id), region)
            }
          >
            Select all
          </QuickAction>
          <QuickAction
            onClick={() => onUpdate(() => [], region)}
            disabled={disabled || selectedCount === 0}
          >
            Clear
          </QuickAction>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {displayedProviders.map((provider) => (
          <ProviderCard
            key={provider.provider_id}
            provider={provider}
            isSelected={selectedProviderIds.includes(provider.provider_id)}
            onToggle={() => toggleProvider(provider.provider_id)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * aria-disabled rather than disabled: a quick action that empties the
 * selection disables itself, and native `disabled` would blur it mid-press.
 */
function QuickAction({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) onClick();
      }}
      aria-disabled={disabled || undefined}
      className="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-white transition-colors hover:bg-gray-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      {children}
    </button>
  );
}

interface ProviderCardProps {
  provider: StreamingProvider;
  isSelected: boolean;
  onToggle: () => void;
  disabled: boolean;
}

function ProviderCard({ provider, isSelected, onToggle, disabled }: ProviderCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-disabled={disabled || undefined}
      role="checkbox"
      aria-checked={isSelected}
      className={cn(
        "relative flex cursor-pointer flex-col items-center rounded-lg border-2 p-3 transition-all aria-disabled:cursor-wait aria-disabled:opacity-50",
        isSelected
          ? "border-red-500 bg-red-500/10"
          : "border-gray-700 bg-gray-800 hover:border-gray-600",
      )}
    >
      {isSelected && (
        <div className="absolute right-1 top-1 rounded-full bg-red-500 p-0.5">
          <Check className="h-3 w-3 text-white" aria-hidden="true" />
        </div>
      )}

      <div className="relative mb-2 flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-gray-700">
        <ProviderImage provider={provider} />
      </div>

      <span className="line-clamp-2 text-center text-xs text-gray-300">
        {provider.provider_name}
      </span>
    </button>
  );
}

function ProviderImage({ provider }: { provider: StreamingProvider }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !provider.logo_path) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-700">
        <Tv className="h-6 w-6 text-gray-400" aria-hidden="true" />
      </div>
    );
  }

  return (
    <Image
      src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
      alt={provider.provider_name}
      fill
      className="object-cover"
      unoptimized
      onError={() => setHasError(true)}
    />
  );
}
