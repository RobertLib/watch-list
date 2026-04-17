import { extractIdFromSlug } from "@/lib/utils";
import { TMDB_CONFIG } from "@/lib/tmdb-cache";

export const contentType = "image/jpeg";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) {
    return new Response(null, { status: 404 });
  }

  const res = await fetch(`${TMDB_CONFIG.BASE_URL}/tv/${id}?language=en-US`, {
    headers: TMDB_CONFIG.headers,
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    return new Response(null, { status: 404 });
  }

  const show = (await res.json()) as {
    backdrop_path?: string | null;
    poster_path?: string | null;
  };

  const imagePath = show.backdrop_path ?? show.poster_path;

  if (!imagePath) {
    return new Response(null, { status: 404 });
  }

  const size = show.backdrop_path ? "w1280" : "w780";
  const imageRes = await fetch(
    `https://image.tmdb.org/t/p/${size}${imagePath}`,
  );

  if (!imageRes.ok) {
    return new Response(null, { status: 404 });
  }

  return imageRes;
}
