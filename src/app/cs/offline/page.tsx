import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "@/i18n/Link";
import { WifiOff } from "lucide-react";

/**
 * The Czech counterpart of `app/(en)/offline/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Offline",
  description:
    "Jste offline. Váš seznam je uložený v tomto prohlížeči a pořád je tady.",
  noindex: true,
  locale: "cs",
});

export default function OfflinePage() {
  return (
    <div className="container mx-auto px-4 py-24 text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-800 flex items-center justify-center">
        <WifiOff className="w-10 h-10 text-gray-500" aria-hidden="true" />
      </div>
      <h1 className="text-3xl font-bold mb-3">Jste offline</h1>
      <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
        WatchList potřebuje připojení, aby mohl cokoli dohledat na TMDb. Váš
        seznam, odškrtnuté epizody i hodnocení jsou v tomto prohlížeči v bezpečí
        a počkají, až se vrátíte.
      </p>
      <Link
        href="/"
        prefetch={false}
        className="mt-8 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
      >
        Zkusit znovu
      </Link>
    </div>
  );
}
