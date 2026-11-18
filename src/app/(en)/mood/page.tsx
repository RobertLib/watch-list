import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { LegacyMoodQueryRedirect } from "@/components/LegacyQueryRedirect";

export const metadata: Metadata = pageMetadata({
  title: "Mood",
  description: "Moving you to the mood you asked for.",
  noindex: true,
});

/**
 * The old address of a mood – `?id=easy-watch` – from before each mood was a
 * path of its own (`/mood/easy-watch`). It only moves the visitor on.
 */
export default function Page() {
  return <LegacyMoodQueryRedirect />;
}
