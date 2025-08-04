import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { Dices } from "lucide-react";
import { TonightPicker } from "@/components/TonightPicker";

export const metadata: Metadata = pageMetadata({
  title: "Pick for Tonight",
  description:
    "Cannot decide? Narrow your own watchlist down to one title by runtime, mood and what you can actually stream right now.",
  noindex: true,
});

export default function TonightPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Dices className="h-8 w-8 text-blue-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Tonight</h1>
        </div>
        <p className="text-gray-400">
          One title off your own list, chosen for the evening in front of you.
          Not another grid to scroll.
        </p>
      </div>

      <TonightPicker />
    </div>
  );
}
