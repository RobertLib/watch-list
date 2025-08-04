import { redirect } from "next/navigation";
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
    redirect(`/movie/${slug}`);
  } else if (type === "tv") {
    redirect(`/tv/${slug}`);
  } else {
    // If type is not recognized, redirect to home page
    redirect("/");
  }
}
