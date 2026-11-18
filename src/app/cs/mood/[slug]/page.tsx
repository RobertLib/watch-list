import type { Metadata } from "next";
import {
  MoodLandingPage,
  moodLandingMetadata,
  moodParams,
} from "@/components/MoodLandingPage";

/**
 * The Czech counterpart of `app/(en)/mood/[slug]/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return moodParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return moodLandingMetadata((await params).slug, undefined, "cs");
}

export default async function Page({ params }: Props) {
  return <MoodLandingPage slug={(await params).slug} locale="cs" />;
}
