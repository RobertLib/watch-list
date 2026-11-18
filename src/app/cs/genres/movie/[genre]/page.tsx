import type { Metadata } from "next";
import {
  GenreLandingPage,
  genreLandingMetadata,
  genreParams,
} from "@/components/GenreLandingPage";

/**
 * The Czech counterpart of `app/(en)/genres/movie/[genre]/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

interface Props {
  params: Promise<{ genre: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return genreParams("movie");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { genre } = await params;
  return genreLandingMetadata("movie", genre, undefined, "cs");
}

export default async function Page({ params }: Props) {
  const { genre } = await params;
  return <GenreLandingPage mediaType="movie" slug={genre} locale="cs" />;
}
