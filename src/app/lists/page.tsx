import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { ListPlus } from "lucide-react";
import { CollectionsManager } from "@/components/CollectionsManager";

export const metadata: Metadata = pageMetadata({
  title: "Your Lists",
  description:
    "The collections you have built from your watchlist, kept in this browser and shareable as a link.",
  noindex: true,
});

export default function ListsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <ListPlus className="h-8 w-8 text-blue-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Your lists</h1>
        </div>
        <p className="text-gray-400">
          Lists of your own making, kept in this browser and shareable as a
          link.
        </p>
      </div>

      <CollectionsManager />
    </div>
  );
}
