import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { CalendarContent } from "@/components/CalendarContent";

/**
 * The Czech counterpart of `app/(en)/calendar/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Kalendář premiér",
  description:
    "Data vysílání epizod a premiér filmů, které sledujete – s regionálními daty uvedení v kinech, kde jsou k dispozici, a exportem do kalendáře.",
  noindex: true,
  locale: "cs",
});

export default function CalendarPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Kalendář premiér</h1>
        <p className="text-gray-400">
          Data vysílání seriálů, které sledujete, a premiéry filmů z vašeho
          seznamu. Kde je to možné, použijeme datum uvedení v kinech ve vašem
          regionu.
        </p>
      </div>

      <CalendarContent />
    </div>
  );
}
