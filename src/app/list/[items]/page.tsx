import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { MediaGrid } from "@/components/MediaGrid";
import { SaveSharedListButton } from "@/components/SaveSharedListButton";
import { getSharedListItems } from "@/lib/shared-list-server";
import {
  decodeSharedList,
  sanitizeSharedListTitle,
  MAX_SHARED_LIST_ITEMS,
} from "@/lib/shared-list";

interface PageProps {
  params: Promise<{ items: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}

/** `?t=` may arrive repeated, and only a single value means anything here. */
function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const [{ items }, query] = await Promise.all([params, searchParams]);
  const refs = decodeSharedList(items);
  const title = sanitizeSharedListTitle(firstParam(query.t));

  const heading = title || "A shared watchlist";
  const description =
    refs.length > 0
      ? `${refs.length} movie${refs.length === 1 ? "" : "s"} and TV show${
          refs.length === 1 ? "" : "s"
        } someone picked out, with streaming availability for your region.`
      : "This shared list has nothing in it.";

  return {
    title: heading,
    description,
    openGraph: {
      title: `${heading} – WatchList`,
      description,
      type: "website",
      siteName: "WatchList",
      images: [
        {
          url: "/opengraph-image.png",
          width: 1200,
          height: 630,
          alt: heading,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${heading} – WatchList`,
      description,
      images: ["/opengraph-image.png"],
    },
    // Every list is its own URL, so indexing them would hand a crawler an
    // unbounded space of near-identical pages built from someone else's picks.
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function SharedListPage({
  params,
  searchParams,
}: PageProps) {
  const [{ items }, query] = await Promise.all([params, searchParams]);
  const refs = decodeSharedList(items);
  const title = sanitizeSharedListTitle(firstParam(query.t));

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

  const listItems = await getSharedListItems(refs);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-blue-400 font-medium mb-1">Shared list</p>
        <h1 className="text-3xl font-bold mb-2">{title || "A shared watchlist"}</h1>
        <p className="text-gray-400">
          {listItems.length} title{listItems.length === 1 ? "" : "s"}
          {listItems.length < refs.length &&
            ` · ${refs.length - listItems.length} could not be loaded`}
        </p>

        <div className="mt-5">
          <SaveSharedListButton items={listItems} />
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
          WatchList tracks what you want to watch and where it is streaming, with
          no account and no sign-up. Save any title with the heart icon, and share
          your own list with a link exactly like this one.
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
