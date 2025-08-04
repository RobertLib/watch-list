"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Check, Tv, Loader2 } from "lucide-react";
import { trackProviderSelection } from "@/lib/analytics";

interface StreamingProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

interface StreamingProviderSelectorProps {
  selectedProviderIds: number[];
  name: string;
  disabled?: boolean;
  region: string;
}

export function StreamingProviderSelector({
  selectedProviderIds,
  name,
  disabled = false,
  region,
}: StreamingProviderSelectorProps) {
  const [providers, setProviders] = useState<StreamingProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(selectedProviderIds)
  );
  const previousRegionRef = useRef<string>(region);

  // Fetch providers from API when region changes
  useEffect(() => {
    const regionChanged = previousRegionRef.current !== region;
    previousRegionRef.current = region;

    async function fetchProviders() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(
          `/api/streaming-providers?region=${region}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch providers");
        }
        const data = await response.json();
        setProviders(data.providers);
        // Only clear selection when region actually changes (platforms are different)
        if (regionChanged) {
          setSelected(new Set());
        }
      } catch (err) {
        console.error("Error fetching streaming providers:", err);
        setError("Failed to load streaming platforms");
      } finally {
        setIsLoading(false);
      }
    }

    fetchProviders();
  }, [region]);

  const toggleProvider = (providerId: number) => {
    if (disabled) return;

    setSelected((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(providerId)) {
        newSet.delete(providerId);
      } else {
        newSet.add(providerId);
      }

      // Track provider selection change
      const selectedArray = Array.from(newSet);
      trackProviderSelection(selectedArray, selectedArray.length, region);

      return newSet;
    });
  };

  const selectAll = () => {
    if (disabled) return;
    const allProviders = providers.map((p) => p.provider_id);
    setSelected(new Set(allProviders));
    trackProviderSelection(allProviders, allProviders.length, region);
  };

  const selectNone = () => {
    if (disabled) return;
    setSelected(new Set());
    trackProviderSelection([], 0, region);
  };

  const selectTop = () => {
    if (disabled) return;
    // Select first 7 providers (API already sorts popular ones first)
    const topProviders = providers.slice(0, 7).map((p) => p.provider_id);
    setSelected(new Set(topProviders));
    trackProviderSelection(topProviders, topProviders.length, region);
  };

  // Convert selected IDs to comma-separated string for form submission
  const selectedValue = Array.from(selected).join(",");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
        <span className="ml-3 text-gray-400">
          Loading streaming platforms...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden input for form submission */}
      <input type="hidden" name={name} value={selectedValue} />

      {/* Quick selection buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={selectAll}
          disabled={disabled}
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Select All
        </button>
        <button
          type="button"
          onClick={selectTop}
          disabled={disabled}
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Select Top 7
        </button>
        <button
          type="button"
          onClick={selectNone}
          disabled={disabled}
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear All
        </button>
      </div>

      {/* Provider grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.provider_id}
            provider={provider}
            isSelected={selected.has(provider.provider_id)}
            onToggle={() => toggleProvider(provider.provider_id)}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Selected count */}
      <div className="text-sm text-gray-400 mt-4">
        {selected.size === 0 ? (
          <span className="text-yellow-500">
            No platforms selected. All content will be shown when streaming
            filter is enabled.
          </span>
        ) : (
          <span>
            {selected.size} platform{selected.size !== 1 ? "s" : ""} selected
          </span>
        )}
      </div>
    </div>
  );
}

interface ProviderCardProps {
  provider: StreamingProvider;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function ProviderCard({
  provider,
  isSelected,
  onToggle,
  disabled,
}: ProviderCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`
        relative flex flex-col items-center p-3 rounded-lg border-2 transition-all
        ${
          isSelected
            ? "border-red-500 bg-red-500/10"
            : "border-gray-700 bg-gray-800 hover:border-gray-600"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-1 right-1 bg-red-500 rounded-full p-0.5">
          <Check className="h-3 w-3 text-white" />
        </div>
      )}

      {/* Provider logo */}
      <div className="relative w-12 h-12 mb-2 rounded-lg overflow-hidden bg-gray-700 flex items-center justify-center">
        <ProviderImage provider={provider} />
      </div>

      {/* Provider name */}
      <span className="text-xs text-center text-gray-300 line-clamp-2">
        {provider.provider_name}
      </span>
    </button>
  );
}

function ProviderImage({ provider }: { provider: StreamingProvider }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !provider.logo_path) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-700">
        <Tv className="h-6 w-6 text-gray-400" />
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
