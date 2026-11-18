import type { Metadata } from "next";
import { DailyContent } from "@/components/DailyContent";
import { pageMetadata } from "@/lib/page-metadata";

/**
 * The Czech counterpart of `app/(en)/daily/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Hádej film – denní filmová hádanka",
  description:
    "Uhodněte film podle jednoho rozmazaného záběru. Každý den nový film, šest pokusů a za každý omyl nápověda. Zdarma, bez registrace.",
  path: "/daily",
  locale: "cs",
});

export default function Page() {
  return <DailyContent />;
}
