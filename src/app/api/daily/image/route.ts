import { NextRequest, NextResponse } from "next/server";
import { getDailyImagePath } from "@/lib/daily-puzzle-server";
import { IMAGE_STEPS, todayUtc } from "@/lib/daily-puzzle";

/**
 * The daily puzzle's image, proxied.
 *
 * The point is what the URL does *not* say. Serving the TMDB path directly would
 * put the film's id in the page source, and the puzzle would be over before it
 * started. Here the URL carries a day and a step, and the mapping to a film stays
 * on the server.
 *
 * The step also picks the TMDB size rather than only driving CSS blur: a
 * downscaled image has genuinely lost its detail, so there is nothing to recover
 * by turning the blur off in devtools.
 */
export async function GET(request: NextRequest) {
  const day = request.nextUrl.searchParams.get("day") ?? "";
  const rawStep = request.nextUrl.searchParams.get("step") ?? "0";

  // Only today's image is served. Any other day would hand out tomorrow's puzzle
  // to anyone willing to edit a query string.
  if (day !== todayUtc()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const parsedStep = Number(rawStep);
  const step = Number.isInteger(parsedStep)
    ? Math.max(0, Math.min(parsedStep, IMAGE_STEPS.length - 1))
    : 0;

  try {
    const path = await getDailyImagePath(day);
    if (!path) {
      return NextResponse.json({ error: "Not available" }, { status: 404 });
    }

    const upstream = await fetch(
      `https://image.tmdb.org/t/p/${IMAGE_STEPS[step]}${path}`,
      { next: { revalidate: 21600 } },
    );

    if (!upstream.ok) {
      return NextResponse.json({ error: "Not available" }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
        // Everyone gets the same image for the same day and step, so it caches
        // hard – but not past the day, hence an hour rather than a year.
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("Error serving the daily puzzle image:", error);
    return NextResponse.json({ error: "Not available" }, { status: 500 });
  }
}
