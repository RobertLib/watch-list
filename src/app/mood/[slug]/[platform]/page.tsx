import type { Metadata } from "next";
import {
  MoodLandingPage,
  moodLandingMetadata,
  moodPlatformParams,
} from "@/components/MoodLandingPage";

interface Props {
  params: Promise<{ slug: string; platform: string }>;
}

/**
 * A mood on one streaming platform – `/mood/christmas/netflix`. Only for the
 * moods that have these (`Mood.platforms`); any other path is a 404.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return moodPlatformParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, platform } = await params;
  return moodLandingMetadata(slug, platform);
}

export default async function Page({ params }: Props) {
  const { slug, platform } = await params;
  return <MoodLandingPage slug={slug} platformSlug={platform} />;
}
