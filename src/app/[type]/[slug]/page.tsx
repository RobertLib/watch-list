import { notFound, permanentRedirect } from "next/navigation";
import { Metadata } from "next";

interface MediaPageProps {
  params: Promise<{
    type: string;
    slug: string;
  }>;
}

// Prevent indexing of this redirect route to avoid duplicate content
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MediaPage({ params }: MediaPageProps) {
  const { type, slug } = await params;

  // Redirect to the appropriate detail page based on type
  if (type === "movie") {
    permanentRedirect(`/movie/${slug}`);
  } else if (type === "tv") {
    permanentRedirect(`/tv/${slug}`);
  } else {
    // Anything else is not a legacy media URL, just a path that does not exist.
    // Sending it to the home page answered 200 with a full copy of the homepage,
    // which is a soft 404 – every unknown two-segment URL looked like a real page.
    notFound();
  }
}
