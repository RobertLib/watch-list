"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { getProviderSearchUrl } from "@/lib/provider-urls";

interface Provider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

interface WatchProvidersData {
  providers?: Provider[];
  rent?: Provider[];
  buy?: Provider[];
}

interface TVWatchProvidersProps {
  tvId: number;
  title: string;
}

export function TVWatchProviders({ tvId, title }: TVWatchProvidersProps) {
  const [providersData, setProvidersData] = useState<WatchProvidersData | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProviders() {
      try {
        const response = await fetch(
          `/api/watch-providers?id=${tvId}&mediaType=tv`
        );
        if (response.ok) {
          const data = await response.json();
          setProvidersData(data);
        }
      } catch (error) {
        console.error("Failed to fetch watch providers:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProviders();
  }, [tvId]);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 shadow animate-pulse">
        <div className="h-6 bg-gray-700 rounded mb-4 w-1/2"></div>
        <div className="space-y-4">
          <div className="h-4 bg-gray-700 rounded w-1/3"></div>
          <div className="flex gap-2">
            <div className="w-8 h-8 bg-gray-700 rounded"></div>
            <div className="w-8 h-8 bg-gray-700 rounded"></div>
            <div className="w-8 h-8 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!providersData) {
    return null;
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6 shadow border border-gray-800">
      <h3 className="text-xl font-bold mb-4 text-white">Where to Watch</h3>
      <div className="space-y-4">
        {providersData.providers && (
          <div>
            <h4 className="font-semibold text-gray-300 mb-2">Streaming</h4>
            <div className="flex flex-wrap gap-2">
              {providersData.providers.map((provider) => {
                const searchUrl = getProviderSearchUrl(
                  provider.provider_id,
                  title
                );
                const content = (
                  <>
                    <Image
                      src={tmdbApi.getImageUrl(provider.logo_path, "w500")}
                      alt={provider.provider_name}
                      width={24}
                      height={24}
                      className="rounded"
                    />
                    <span className="text-sm text-white">
                      {provider.provider_name}
                    </span>
                  </>
                );

                return searchUrl ? (
                  <Link
                    key={provider.provider_id}
                    href={searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 rounded-lg p-2 transition-colors"
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={provider.provider_id}
                    className="flex items-center gap-2 bg-gray-800 rounded-lg p-2"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {providersData.rent && (
          <div>
            <h4 className="font-semibold text-gray-300 mb-2">Rent</h4>
            <div className="flex flex-wrap gap-2">
              {providersData.rent.map((provider) => {
                const searchUrl = getProviderSearchUrl(
                  provider.provider_id,
                  title
                );
                const content = (
                  <>
                    <Image
                      src={tmdbApi.getImageUrl(provider.logo_path, "w500")}
                      alt={provider.provider_name}
                      width={24}
                      height={24}
                      className="rounded"
                    />
                    <span className="text-sm text-white">
                      {provider.provider_name}
                    </span>
                  </>
                );

                return searchUrl ? (
                  <Link
                    key={provider.provider_id}
                    href={searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 rounded-lg p-2 transition-colors"
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={provider.provider_id}
                    className="flex items-center gap-2 bg-gray-800 rounded-lg p-2"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {providersData.buy && (
          <div>
            <h4 className="font-semibold text-gray-300 mb-2">Buy</h4>
            <div className="flex flex-wrap gap-2">
              {providersData.buy.map((provider) => {
                const searchUrl = getProviderSearchUrl(
                  provider.provider_id,
                  title
                );
                const content = (
                  <>
                    <Image
                      src={tmdbApi.getImageUrl(provider.logo_path, "w500")}
                      alt={provider.provider_name}
                      width={24}
                      height={24}
                      className="rounded"
                    />
                    <span className="text-sm text-white">
                      {provider.provider_name}
                    </span>
                  </>
                );

                return searchUrl ? (
                  <Link
                    key={provider.provider_id}
                    href={searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 rounded-lg p-2 transition-colors"
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={provider.provider_id}
                    className="flex items-center gap-2 bg-gray-800 rounded-lg p-2"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
