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

  let res: Response;
  try {
    res = await fetch(`${TMDB_CONFIG.BASE_URL}/person/${id}?language=en-US`, {
      headers: TMDB_CONFIG.headers,
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return new Response(null, { status: 404 });
  }

  if (!res.ok) {
    return new Response(null, { status: 404 });
  }

  const person = (await res.json()) as {
    profile_path?: string | null;
  };

  if (!person.profile_path) {
    return new Response(null, { status: 404 });
  }

  let imageRes: Response;
  try {
    imageRes = await fetch(
      `https://image.tmdb.org/t/p/w780${person.profile_path}`,
      { signal: AbortSignal.timeout(10000) },
    );
  } catch {
    return new Response(null, { status: 404 });
  }

  if (!imageRes.ok) {
    return new Response(null, { status: 404 });
  }

  return imageRes;
}
