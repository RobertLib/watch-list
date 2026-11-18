import type { Metadata } from "next";
import {
  MoodLandingPage,
  moodLandingMetadata,
  moodPlatformParams,
} from "@/components/MoodLandingPage";

/**
 * The Czech counterpart of `app/(en)/mood/[slug]/[platform]/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

interface Props {
  params: Promise<{ slug: string; platform: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return moodPlatformParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, platform } = await params;
  return moodLandingMetadata(slug, platform, "cs");
}

export default async function Page({ params }: Props) {
  const { slug, platform } = await params;
  return <MoodLandingPage slug={slug} platformSlug={platform} locale="cs" />;
}
