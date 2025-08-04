"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ListChecks } from "lucide-react";
import { MediaGrid } from "@/components/MediaGrid";
import { LoadingSection } from "@/components/LoadingSpinner";
import { SaveSharedListButton } from "@/components/SaveSharedListButton";
import { CompareWithMineButton } from "@/components/CompareWithMineButton";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useSettingsKey } from "@/hooks/useSettings";
import { getSharedListItems } from "@/lib/shared-list-data";
import {
  decodeSharedList,
  sanitizeSharedListTitle,
  MAX_SHARED_LIST_ITEMS,
} from "@/lib/shared-list";

/**
 * Somebody else's list, carried entirely by the link.
 *
 * The ids are in `?items=` and the name in `?t=` – nothing about the list is
 * stored anywhere, which is what lets one exist without an account.
 */
export function SharedListContent() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8" />}>
      <SharedList />
    </Suspense>
  );
}

function SharedList() {
  const searchParams = useSearchParams();
  const settingsKey = useSettingsKey();
  const refs = decodeSharedList(searchParams.get("items") ?? "");
  const title = sanitizeSharedListTitle(searchParams.get("t") ?? "");

  useDocumentTitle(title || "A shared watchlist");

  const { data: listItems, isLoading } = useAsyncData(
    async () => (refs.length > 0 ? getSharedListItems(refs) : []),
    [searchParams.get("items"), settingsKey],
  );

  if (refs.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
          <ListChecks className="w-10 h-10 text-gray-600" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold mb-3">This list is empty</h1>
        <p className="text-gray-400 max-w-md mx-auto">
          The link does not carry any titles. It may have been cut short on its
          way here – ask for it again, or start your own list.
        </p>
        <Link
          href="/"
          prefetch={false}
          className="mt-6 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
        >
          Discover Content
        </Link>
      </div>
    );
  }

  if (isLoading || !listItems) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 space-y-2">
          <div className="h-4 w-24 bg-gray-800 rounded animate-pulse" />
          <div className="h-9 w-64 bg-gray-700 rounded animate-pulse" />
        </div>
        <LoadingSection title="" rows={2} cols={6} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-blue-400 font-medium mb-1">Shared list</p>
        <h1 className="text-3xl font-bold mb-2">
          {title || "A shared watchlist"}
        </h1>
        <p className="text-gray-400">
          {listItems.length} title{listItems.length === 1 ? "" : "s"}
          {listItems.length < refs.length &&
            ` · ${refs.length - listItems.length} could not be loaded`}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SaveSharedListButton items={listItems} />
          <CompareWithMineButton items={refs} />
        </div>
      </div>

      <MediaGrid items={listItems} />

      {refs.length >= MAX_SHARED_LIST_ITEMS && (
        <p className="mt-8 text-sm text-gray-500">
          Shared lists carry at most {MAX_SHARED_LIST_ITEMS} titles, so this one
          may be shorter than the original.
        </p>
      )}

      <div className="mt-12 border-t border-gray-800 pt-8">
        <h2 className="text-xl font-semibold text-white mb-2">
          Build your own
        </h2>
        <p className="text-gray-400 max-w-2xl leading-relaxed">
          WatchList tracks what you want to watch and where it is streaming,
          with no account and no sign-up. Save any title with the heart icon,
          and share your own list with a link exactly like this one.
        </p>
        <Link
          href="/"
          prefetch={false}
          className="mt-5 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
        >
          Start browsing
        </Link>
      </div>
    </div>
  );
}
