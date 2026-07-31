"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Check, Tv, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const POPULAR_COUNT = 7;

interface StreamingProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

interface StreamingProviderSelectorProps {
  selectedProviderIds: number[];
  onChange: (providerIds: number[]) => void;
  region: string;
}

export function StreamingProviderSelector({
  selectedProviderIds,
  onChange,
  region,
}: StreamingProviderSelectorProps) {
  const [providers, setProviders] = useState<StreamingProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousRegionRef = useRef(region);

  // Latest props for the region effect, which must only re-run on region change
  const latestRef = useRef({ selectedProviderIds, onChange });
  useEffect(() => {
    latestRef.current = { selectedProviderIds, onChange };
  });

  // Fetch providers from API when region changes
  useEffect(() => {
    const regionChanged = previousRegionRef.current !== region;
    previousRegionRef.current = region;
    let cancelled = false;

    async function fetchProviders() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(
          `/api/streaming-providers?region=${region}`,
        );
        if (!response.ok) {
          throw new Error("Failed to fetch providers");
        }
        const data = await response.json();
        if (cancelled) return;

        const nextProviders: StreamingProvider[] = data.providers;
        setProviders(nextProviders);

        // Platforms differ per region, so drop the ones that are gone
        if (regionChanged) {
          const available = new Set(
            nextProviders.map((provider) => provider.provider_id),
          );
          const { selectedProviderIds: selected, onChange: save } =
            latestRef.current;
          const stillAvailable = selected.filter((id) => available.has(id));

          if (stillAvailable.length !== selected.length) {
            save(stillAvailable);
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching streaming providers:", err);
        setError("Failed to load streaming platforms");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchProviders();

    return () => {
      cancelled = true;
    };
  }, [region]);

  const toggleProvider = (providerId: number) => {
    onChange(
      selectedProviderIds.includes(providerId)
        ? selectedProviderIds.filter((id) => id !== providerId)
        : [...selectedProviderIds, providerId],
    );
  };

  if (isLoading) {
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
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  const selectedCount = selectedProviderIds.length;

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
            onClick={() =>
              onChange(
                providers
                  .slice(0, POPULAR_COUNT)
                  .map((provider) => provider.provider_id),
              )
            }
          >
            Popular
          </QuickAction>
          <QuickAction
            onClick={() =>
              onChange(providers.map((provider) => provider.provider_id))
            }
          >
            Select all
          </QuickAction>
          <QuickAction
            onClick={() => onChange([])}
            disabled={selectedCount === 0}
          >
            Clear
          </QuickAction>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.provider_id}
            provider={provider}
            isSelected={selectedProviderIds.includes(provider.provider_id)}
            onToggle={() => toggleProvider(provider.provider_id)}
          />
        ))}
      </div>
    </div>
  );
}

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
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

interface ProviderCardProps {
  provider: StreamingProvider;
  isSelected: boolean;
  onToggle: () => void;
}

function ProviderCard({ provider, isSelected, onToggle }: ProviderCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="checkbox"
      aria-checked={isSelected}
      className={cn(
        "relative flex cursor-pointer flex-col items-center rounded-lg border-2 p-3 transition-all",
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
