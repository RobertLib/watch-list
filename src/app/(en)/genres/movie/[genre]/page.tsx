import type { Metadata } from "next";
import {
  GenreLandingPage,
  genreLandingMetadata,
  genreParams,
} from "@/components/GenreLandingPage";

interface Props {
  params: Promise<{ genre: string }>;
}

/** Every genre is listed below; any other path is a 404, not a render. */
export const dynamicParams = false;

export function generateStaticParams() {
  return genreParams("movie");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { genre } = await params;
  return genreLandingMetadata("movie", genre);
}

export default async function Page({ params }: Props) {
  const { genre } = await params;
  return <GenreLandingPage mediaType="movie" slug={genre} />;
}
