"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function DidYouKnowExpandButton({
  total,
  initialCount,
}: {
  total: number;
  initialCount: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (total <= initialCount) return null;

  return (
    <>
      <style>{`
        .dyk-extra { display: ${expanded ? "flex" : "none"}; }
      `}</style>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 flex items-center gap-1 text-blue-400 text-sm hover:underline"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-4 h-4" /> Show less
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" /> Show {total - initialCount} more
          </>
        )}
      </button>
    </>
  );
}
