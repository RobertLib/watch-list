import { env } from "process";

// Generate a simple API key for IndexNow (you can also use a custom one)
export const INDEXNOW_API_KEY =
  env.INDEXNOW_API_KEY || "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";

// Base URL for the website
const BASE_URL = env.NEXT_PUBLIC_BASE_URL || "https://www.watch-list.me";

// Debug mode
const DEBUG_MODE =
  env.NEXT_PUBLIC_INDEXNOW_DEBUG === "true" || env.NODE_ENV === "development";

// IndexNow endpoints
const INDEXNOW_ENDPOINTS = [
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow",
  "https://yandex.com/indexnow",
];

export interface IndexNowSubmission {
  host: string;
  key: string;
  keyLocation?: string;
  urlList: string[];
}

/**
 * Submit URLs to IndexNow for immediate indexing
 */
export async function submitToIndexNow(
  urls: string | string[]
): Promise<boolean> {
  const urlList = Array.isArray(urls) ? urls : [urls];

  if (urlList.length === 0) {
    return false;
  }

  // Skip in development unless debug mode is enabled
  if (env.NODE_ENV === "development" && !DEBUG_MODE) {
    console.log("IndexNow: Skipping submission in development mode");
    return true; // Return true to not break the flow
  }

  // Extract host from the first URL
  const firstUrl = new URL(urlList[0]);
  const host = firstUrl.hostname;

  const submission: IndexNowSubmission = {
    host,
    key: INDEXNOW_API_KEY,
    keyLocation: `https://${host}/${INDEXNOW_API_KEY}.txt`,
    urlList,
  };

  // Try each endpoint until one succeeds
  for (const endpoint of INDEXNOW_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "WatchList/1.0",
        },
        body: JSON.stringify(submission),
      });

      if (response.ok) {
        if (DEBUG_MODE) {
          console.log(`IndexNow submission successful to ${endpoint}:`, {
            status: response.status,
            urls: urlList,
          });
        }
        return true;
      } else {
        if (DEBUG_MODE) {
          console.warn(`IndexNow submission failed to ${endpoint}:`, {
            status: response.status,
            statusText: response.statusText,
          });
        }
      }
    } catch (error) {
      if (DEBUG_MODE) {
        console.error(`IndexNow submission error to ${endpoint}:`, error);
      }
    }
  }

  return false;
}

/**
 * Submit a single URL to IndexNow
 */
export async function submitUrlToIndexNow(url: string): Promise<boolean> {
  return submitToIndexNow([url]);
}

/**
 * Generate the full URL for a given path
 */
export function getFullUrl(path: string): string {
  return new URL(path, BASE_URL).toString();
}

/**
 * Submit a path to IndexNow (automatically converts to full URL)
 */
export async function submitPathToIndexNow(path: string): Promise<boolean> {
  const fullUrl = getFullUrl(path);
  return submitUrlToIndexNow(fullUrl);
}
