import type { ReviewsResponse } from "@/types/tmdb";

interface MediaRatingPanelProps {
  voteAverage: number;
  voteCount: number;
  reviews?: ReviewsResponse;
}

function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 8.5) return { label: "Masterpiece", color: "text-emerald-400" };
  if (score >= 7.5) return { label: "Great", color: "text-green-400" };
  if (score >= 6.5) return { label: "Good", color: "text-lime-400" };
  if (score >= 5.5) return { label: "Average", color: "text-yellow-400" };
  if (score >= 4.0) return { label: "Mixed", color: "text-orange-400" };
  return { label: "Poor", color: "text-red-400" };
}

function ringColor(score: number): string {
  if (score >= 8.5) return "#34d399"; // emerald
  if (score >= 7.5) return "#4ade80"; // green
  if (score >= 6.5) return "#a3e635"; // lime
  if (score >= 5.5) return "#facc15"; // yellow
  if (score >= 4.0) return "#fb923c"; // orange
  return "#f87171"; // red
}

// Build rating distribution buckets (1-10) from review ratings
function buildDistribution(
  reviews: ReviewsResponse | undefined,
): { score: number; count: number; pct: number }[] {
  const buckets: number[] = Array(10).fill(0);

  reviews?.results?.forEach((r) => {
    if (r.author_details.rating != null) {
      const idx = Math.min(Math.round(r.author_details.rating) - 1, 9);
      if (idx >= 0) buckets[idx]++;
    }
  });

  const max = Math.max(...buckets, 1);
  return buckets.map((count, i) => ({
    score: i + 1,
    count,
    pct: Math.round((count / max) * 100),
  }));
}

export function MediaRatingPanel({
  voteAverage,
  voteCount,
  reviews,
}: MediaRatingPanelProps) {
  const score = Number(voteAverage.toFixed(1));
  const { label, color } = scoreLabel(score);
  const stroke = ringColor(score);

  // SVG ring params
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const fillPct = score / 10;
  const dashOffset = circumference * (1 - fillPct);

  const distribution = buildDistribution(reviews);
  const hasDistribution = distribution.some((d) => d.count > 0);

  const reviewsWithRating =
    reviews?.results?.filter((r) => r.author_details.rating != null) ?? [];
  const avgReviewRating =
    reviewsWithRating.length > 0
      ? reviewsWithRating.reduce(
          (sum, r) => sum + (r.author_details.rating ?? 0),
          0,
        ) / reviewsWithRating.length
      : null;

  return (
    <div className="bg-gray-800 rounded-lg p-5">
      <h3 className="text-lg font-bold text-white mb-4">Rating</h3>

      {/* Score ring */}
      <div className="flex items-center gap-5 mb-5">
        <div className="relative shrink-0">
          <svg width="110" height="110" className="-rotate-90">
            {/* Track */}
            <circle
              cx="55"
              cy="55"
              r={radius}
              fill="none"
              stroke="#374151"
              strokeWidth="8"
            />
            {/* Fill */}
            <circle
              cx="55"
              cy="55"
              r={radius}
              fill="none"
              stroke={stroke}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-white leading-none">
              {score.toFixed(1)}
            </span>
            <span className="text-gray-400 text-xs mt-0.5">/10</span>
          </div>
        </div>

        <div>
          <p className={`text-lg font-bold ${color}`}>{label}</p>
          <p className="text-gray-400 text-sm mt-1">
            {voteCount.toLocaleString("en-US")} votes
          </p>
          {avgReviewRating !== null && (
            <p className="text-gray-400 text-sm mt-1">
              Critic avg.{" "}
              <span className="text-white font-medium">
                {avgReviewRating.toFixed(1)}
              </span>
              <span className="text-gray-500 text-xs">
                {" "}
                ({reviewsWithRating.length} reviews)
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Score bar */}

      {/* Review rating distribution */}
      {hasDistribution && (
        <div className="mt-4">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">
            Review score distribution
          </p>
          <div className="flex items-end gap-0.5 h-12">
            {distribution.map((d) => (
              <div
                key={d.score}
                className="flex-1 flex flex-col items-center gap-0.5"
                title={`Score ${d.score}: ${d.count} review${d.count !== 1 ? "s" : ""}`}
              >
                <div
                  className="w-full flex items-end"
                  style={{ height: "36px" }}
                >
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: d.pct
                        ? `${Math.max(d.pct * 0.36, d.count > 0 ? 3 : 0)}px`
                        : "0px",
                      background: d.count > 0 ? stroke : "transparent",
                      opacity: d.count === 0 ? 0 : 0.45 + d.pct / 200,
                    }}
                  />
                </div>
                <span className="text-gray-600 text-[9px] leading-none">
                  {d.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
