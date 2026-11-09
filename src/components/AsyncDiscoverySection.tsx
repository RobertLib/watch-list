"use client";

import { Fragment, type ReactNode } from "react";
import { LoadingSection } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { useAsyncData } from "@/hooks/useAsyncData";

interface DiscoveryPage<T> {
  results: T[];
  total_pages: number;
}

/**
 * Each listing owns its initial request and retry, preserving its siblings.
 *
 * `placeholder` is the build's snapshot of page one (`build-time-tmdb.ts`):
 * what the prerendered page shows, and what the browser starts from until its
 * own page one arrives.
 */
export function AsyncDiscoverySection<T>({
  title,
  loadKey,
  loadFirstPage,
  placeholder,
  children,
}: {
  title: string;
  loadKey: string;
  loadFirstPage: () => Promise<DiscoveryPage<T>>;
  placeholder?: DiscoveryPage<T> | null;
  children: (page: DiscoveryPage<T>) => ReactNode;
}) {
  const { data, isLoading, error, reload } = useAsyncData(
    loadFirstPage,
    [loadKey],
    placeholder,
  );

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

  // The listing below keeps its pages in state seeded from `data`, so the
  // visitor's own page one has to remount it rather than reach it as a prop.
  return (
    <Fragment key={data === placeholder ? "snapshot" : "loaded"}>
      {children(data)}
    </Fragment>
  );
}
