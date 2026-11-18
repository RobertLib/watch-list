import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { Dices } from "lucide-react";
import { TonightPicker } from "@/components/TonightPicker";

/**
 * The Czech counterpart of `app/(en)/tonight/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Výběr na dnešní večer",
  description:
    "Nemůžete se rozhodnout? Zužte svůj seznam na jediný titul podle délky, nálady a toho, co právě můžete streamovat.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Dices className="h-8 w-8 text-blue-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Dnes večer</h1>
        </div>
        <p className="text-gray-400">
          Jeden titul z vašeho vlastního seznamu, vybraný na večer, který máte před sebou. Žádná další mřížka k procházení.
        </p>
      </div>

      <TonightPicker />
    </div>
  );
}
