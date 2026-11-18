import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "@/i18n/Link";
import { ArrowLeft } from "lucide-react";
import { HigherLowerGame } from "@/components/HigherLowerGame";

/**
 * The Czech counterpart of `app/(en)/daily/higher-lower/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Vyšší, nebo nižší – hra s hodnocením filmů",
  description:
    "Který film má vyšší hodnocení? Dva filmy, u jednoho vidíte skóre – odhadněte to druhé a udržte sérii. Zdarma, bez konce, bez registrace.",
  path: "/daily/higher-lower",
  locale: "cs",
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
          Denní hádanka
        </Link>
        <h1 className="text-3xl font-bold mb-2">
          Vyšší, nebo nižší: který film má vyšší hodnocení?
        </h1>
        <p className="text-gray-400">
          Dva filmy, u jednoho vidíte hodnocení. Odhadněte, jestli má ten druhý
          na TMDb vyšší, nebo nižší skóre, a pokračujte v sérii. Remíza se
          počítá ve váš prospěch.
        </p>
      </div>

      <HigherLowerGame />
    </div>
  );
}
