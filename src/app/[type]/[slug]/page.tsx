import { redirect } from "next/navigation";

interface MediaPageProps {
  params: Promise<{
    type: string;
    slug: string;
  }>;
}

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
