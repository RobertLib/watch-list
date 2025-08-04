import type { Metadata } from "next";
import { MoodContent } from "@/components/MoodContent";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Mood",
  description:
    "Films and series picked for how you want to feel rather than what genre they are filed under.",
  noindex: true,
});

/** One mood's picks – `?id=cozy`. The list of moods lives at `/moods`. */
export default function Page() {
  return <MoodContent />;
}
