"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface PersonBiographyProps {
  biography: string;
}

const COLLAPSE_THRESHOLD = 600; // characters

export function PersonBiography({ biography }: PersonBiographyProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = biography.length > COLLAPSE_THRESHOLD;

  const paragraphs = biography.split("\n").filter((p) => p.trim().length > 0);

  // For collapsed state, show only first paragraph(s) that fit within threshold
  const collapsedText =
    isLong && !expanded ? biography.slice(0, COLLAPSE_THRESHOLD) : null;

  const collapsedParagraphs = collapsedText
    ? collapsedText.split("\n").filter((p) => p.trim().length > 0)
    : null;

  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold mb-3">Biography</h2>
      <div className="text-gray-300 space-y-3 leading-relaxed">
        {(expanded || !isLong ? paragraphs : collapsedParagraphs!).map(
          (paragraph, i, arr) => (
            <p key={i}>
              {paragraph}
              {!expanded && isLong && i === arr.length - 1 && "…"}
            </p>
          ),
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" /> Read full biography
            </>
          )}
        </button>
      )}
    </section>
  );
}
