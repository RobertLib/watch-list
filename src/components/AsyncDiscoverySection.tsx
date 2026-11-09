"use client";

import { Fragment, type ReactNode } from "react";
import { LoadingSection } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { LoadMoreButton } from "@/components/LoadMoreButton";
import { SnapshotRefreshNotice } from "@/components/SnapshotRefreshNotice";
import { useAsyncData } from "@/hooks/useAsyncData";

interface DiscoveryPage<T> {
  results: T[];
  total_pages: number;
}

/**
 * Whether the page a listing was handed is the build's snapshot, and what to
 * do about it. A paginated listing must not append the visitor's page two to
 * the snapshot's page one: the two come from different regions and settings,
 * and the snapshot is replaced – the listing remounted, its appended pages
 * with it – the moment the visitor's own page one arrives.
 */
export interface SnapshotState {
  /** The page is the build's snapshot, not the visitor's own page one. */
  isSnapshot: boolean;
  /** The visitor's own page one failed, and the snapshot is staying. */
  refreshFailed: boolean;
  /** Ask for the visitor's own page one again. */
  retry: () => void;
  isRetrying: boolean;
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
  children: (page: DiscoveryPage<T>, snapshot: SnapshotState) => ReactNode;
}) {
  const { data, isLoading, error, reload, isPlaceholder, refreshError, isRetrying } = useAsyncData(
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
    <Fragment key={isPlaceholder ? "snapshot" : "loaded"}>
      {children(data, {
        isSnapshot: isPlaceholder,
        refreshFailed: refreshError != null,
        retry: reload,
        isRetrying,
      })}
    </Fragment>
  );
}

/**
 * A paginated listing's "Load More", aware of the snapshot it may be showing.
 *
 * While the page is the build's snapshot the button is there but disabled –
 * in the same place, so nothing below moves when it comes alive – because the
 * page it would add belongs to a different listing (see `SnapshotState`). If
 * the visitor's own page one failed and the snapshot is staying, the slot
 * offers a retry of that load instead: once it answers, the listing remounts
 * from it and "Load More" works as usual.
 */
export function SnapshotAwareLoadMore({
  snapshot,
  onLoadMore,
  children,
}: {
  snapshot?: SnapshotState;
  onLoadMore: () => Promise<void>;
  children: ReactNode;
}) {
  if (snapshot?.refreshFailed) {
    return (
      <SnapshotRefreshNotice
        className="mt-8 mb-12 mx-auto w-fit"
        message="Showing a saved list – the one for your region could not be loaded."
        onRetry={snapshot.retry}
        isRetrying={snapshot.isRetrying}
      />
    );
  }

  return (
    <LoadMoreButton onLoadMore={onLoadMore} disabled={snapshot?.isSnapshot ?? false}>
      {children}
    </LoadMoreButton>
  );
}
