import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HigherLowerGame } from "@/components/HigherLowerGame";

export const metadata: Metadata = pageMetadata({
  title: "Higher or Lower",
  description:
    "Guess which of two films scored higher. A quick, endless game built from the ratings of the whole TMDB catalogue.",
  path: "/daily/higher-lower",
});

export default function HigherLowerPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto mb-8">
        <Link
          href="/daily"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Daily puzzle
        </Link>
        <h1 className="text-3xl font-bold mb-2">Higher or lower</h1>
        <p className="text-gray-400">
          Two films, one score showing. Guess whether the other scored higher or
          lower on TMDb and keep the run going. A tie counts in your favour.
        </p>
      </div>

      <HigherLowerGame />
    </div>
  );
}
