import { useCallback } from "react";

export interface UseIndexNowReturn {
  submitUrls: (urls: string | string[]) => Promise<boolean>;
  submitCurrentPage: () => Promise<boolean>;
  submitPath: (path: string) => Promise<boolean>;
}

/**
 * Hook for submitting URLs to IndexNow
 */
export function useIndexNow(): UseIndexNowReturn {
  const submitUrls = useCallback(
    async (urls: string | string[]): Promise<boolean> => {
      try {
        const response = await fetch("/api/indexnow", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ urls }),
        });

        const result = await response.json();

        if (response.ok) {
          console.log("IndexNow submission successful:", result);
          return true;
        } else {
          console.error("IndexNow submission failed:", result);
          return false;
        }
      } catch (error) {
        console.error("Error submitting to IndexNow:", error);
        return false;
      }
    },
    []
  );

  const submitCurrentPage = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    return submitUrls(window.location.href);
  }, [submitUrls]);

  const submitPath = useCallback(
    async (path: string): Promise<boolean> => {
      if (typeof window === "undefined") return false;
      const fullUrl = new URL(path, window.location.origin).toString();
      return submitUrls(fullUrl);
    },
    [submitUrls]
  );

  return {
    submitUrls,
    submitCurrentPage,
    submitPath,
  };
}
