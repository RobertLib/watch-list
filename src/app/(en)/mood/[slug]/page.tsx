import type { Metadata } from "next";
import {
  MoodLandingPage,
  moodLandingMetadata,
  moodParams,
} from "@/components/MoodLandingPage";

interface Props {
  params: Promise<{ slug: string }>;
}

/** Every mood is listed below; any other path is a 404, not a render. */
export const dynamicParams = false;

export function generateStaticParams() {
  return moodParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return moodLandingMetadata((await params).slug);
}

export default async function Page({ params }: Props) {
  return <MoodLandingPage slug={(await params).slug} />;
}
