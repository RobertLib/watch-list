"use client";

import type { ReactNode } from "react";
import { LoadingSection } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { useAsyncData } from "@/hooks/useAsyncData";

interface DiscoveryPage<T> {
  results: T[];
  total_pages: number;
}

/** Each listing owns its initial request and retry, preserving its siblings. */
export function AsyncDiscoverySection<T>({
  title,
  loadKey,
  loadFirstPage,
  children,
}: {
  title: string;
  loadKey: string;
  loadFirstPage: () => Promise<DiscoveryPage<T>>;
  children: (page: DiscoveryPage<T>) => ReactNode;
}) {
  const { data, isLoading, error, reload } = useAsyncData(loadFirstPage, [loadKey]);

  if (isLoading) return <LoadingSection title={title} count={12} />;

  if (error || !data) {
    return (
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>
        <LoadFailureNotice
          title={`Could not load ${title.toLowerCase()}`}
          description="TMDB did not answer. Check your connection and try again. The other listings are still available."
          onRetry={reload}
          compact
        />
      </section>
    );
  }

  return children(data);
}
