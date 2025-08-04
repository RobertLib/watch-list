"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface LoadMoreButtonProps {
  onLoadMore: () => Promise<void>;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  onLoadComplete?: () => void;
}

export function LoadMoreButton({
  onLoadMore,
  disabled = false,
  className,
  children = "Load More",
  onLoadComplete,
}: LoadMoreButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (disabled || loading) return;

    setLoading(true);
    try {
      await onLoadMore();
      // Call the completion callback after successful load
      onLoadComplete?.();
    } catch (error) {
      console.error("Error loading more items:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center mt-8 mb-12">
      <button
        onClick={handleClick}
        disabled={disabled || loading}
        className={cn(
          "px-6 py-3 rounded-lg font-medium transition-all duration-200",
          "bg-red-600 hover:bg-red-700 text-white",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2",
          loading && "cursor-wait",
          className
        )}
        aria-label={loading ? "Loading more content..." : "Load more content"}
        aria-busy={loading}
      >
        {loading ? (
          <div className="flex items-center space-x-2">
            <div
              className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
              role="status"
              aria-label="Loading"
            />
            <span>Loading...</span>
          </div>
        ) : (
          children
        )}
      </button>
    </div>
  );
}
