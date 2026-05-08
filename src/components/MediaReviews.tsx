"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Star, User } from "lucide-react";
import type { Review, ReviewsResponse } from "@/types/tmdb";

const INITIAL_REVIEWS = 3;

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ~5 lines at text-sm ≈ 350 characters
const LONG_THRESHOLD = 350;

function ReviewCard({ review }: { review: Review }) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const content = stripMarkdown(review.content);
  const mightBeLong = content.length > LONG_THRESHOLD;

  // After mount, check if the text is actually clamped (overflowing)
  useEffect(() => {
    if (!mightBeLong) return;
    const el = textRef.current;
    if (el) {
      setIsClamped(el.scrollHeight > el.clientHeight);
    }
  }, [mightBeLong]);

  return (
    <article className="bg-gray-800 rounded-lg p-5 border border-gray-700">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-gray-400" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm truncate">
              {review.author}
            </p>
            <p className="text-gray-500 text-xs">
              {formatDate(review.created_at)}
            </p>
          </div>
        </div>
        {review.author_details.rating != null && (
          <span className="flex items-center gap-1 text-yellow-400 text-sm font-medium shrink-0">
            <Star className="w-3.5 h-3.5 fill-current" />
            {review.author_details.rating}/10
          </span>
        )}
      </div>

      {/* Full text always in HTML — only visually clamped via CSS */}
      <p
        ref={textRef}
        className={`text-gray-300 leading-relaxed text-sm${!expanded && mightBeLong ? " line-clamp-5" : ""}`}
      >
        {content}
      </p>

      <div className="mt-3 flex items-center gap-4">
        {(isClamped || expanded) && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-blue-400 text-sm hover:underline flex items-center gap-1"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" /> Read more
              </>
            )}
          </button>
        )}
        <a
          href={review.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-gray-500 text-sm hover:text-gray-300 transition-colors ml-auto"
        >
          Full review →
        </a>
      </div>
    </article>
  );
}

interface MediaReviewsProps {
  reviews: ReviewsResponse | undefined;
}

export function MediaReviews({ reviews }: MediaReviewsProps) {
  const [showAll, setShowAll] = useState(false);

  if (!reviews?.results?.length) return null;

  const visible = showAll
    ? reviews.results
    : reviews.results.slice(0, INITIAL_REVIEWS);
  const hasMore = reviews.results.length > INITIAL_REVIEWS;

  return (
    <section className="mt-12 mb-12">
      <h2 className="text-2xl font-bold mb-6">
        User Reviews
        {reviews.total_results > 0 && (
          <span className="text-gray-500 text-base font-normal ml-2">
            ({reviews.total_results})
          </span>
        )}
      </h2>

      <div className="space-y-4">
        {visible.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 flex items-center gap-1.5 text-blue-400 text-sm hover:underline"
        >
          {showAll ? (
            <>
              <ChevronUp className="w-4 h-4" /> Show fewer reviews
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" /> Show all{" "}
              {reviews.results.length} reviews
            </>
          )}
        </button>
      )}
    </section>
  );
}
