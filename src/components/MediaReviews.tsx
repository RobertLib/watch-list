import type { ReviewsResponse } from "@/types/tmdb";

interface MediaReviewsProps {
  reviews: ReviewsResponse | undefined;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/#+\s/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .trim();
}

export function MediaReviews({ reviews }: MediaReviewsProps) {
  if (!reviews?.results?.length) return null;

  const topReviews = reviews.results.slice(0, 3);

  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-6">User Reviews</h2>
      <div className="space-y-6">
        {topReviews.map((review) => {
          const cleanContent = stripMarkdown(review.content);
          return (
            <article
              key={review.id}
              className="bg-gray-800 rounded-lg p-6 border border-gray-700"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">
                  Review by {review.author}
                </h3>
                {review.author_details.rating != null && (
                  <span className="flex items-center gap-1 text-yellow-400 text-sm">
                    ★ {review.author_details.rating}/10
                  </span>
                )}
              </div>
              <p className="text-gray-300 leading-relaxed line-clamp-6 text-sm">
                {cleanContent}
              </p>
              <a
                href={review.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-3 inline-block text-sm text-blue-400 hover:text-blue-300"
              >
                Read full review →
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
