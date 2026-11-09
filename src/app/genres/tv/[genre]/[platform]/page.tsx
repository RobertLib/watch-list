import type { Metadata } from "next";
import {
  GenreLandingPage,
  genreLandingMetadata,
  genrePlatformParams,
} from "@/components/GenreLandingPage";

interface Props {
  params: Promise<{ genre: string; platform: string }>;
}

/** Every genre on every landing platform; any other path is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return genrePlatformParams("tv");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { genre, platform } = await params;
  return genreLandingMetadata("tv", genre, platform);
}

export default async function Page({ params }: Props) {
  const { genre, platform } = await params;
  return <GenreLandingPage mediaType="tv" slug={genre} platformSlug={platform} />;
}
