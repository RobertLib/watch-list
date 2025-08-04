type ClassValue = string | number | boolean | undefined | null | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  return inputs.flat().filter(Boolean).join(" ").trim();
}

export function clsx(...inputs: ClassValue[]): string {
  return cn(...inputs);
}

/**
 * Creates a slug from title and ID
 * Format: "movie-title-123" or "tv-show-title-456"
 */
export function createSlug(title: string, id: number): string {
  // Handle undefined/null title
  if (!title || typeof title !== "string") {
    return `item-${id}`;
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with dashes
    .replace(/-+/g, "-") // Replace multiple dashes with single dash
    .trim()
    .replace(/^-+|-+$/g, ""); // Remove dashes from start and end

  return `${slug}-${id}`;
}

/**
 * Extracts ID from slug
 * Supports both formats:
 * - "movie-title-123" returns 123
 * - "123-movie-title" returns 123
 */
export function extractIdFromSlug(slug: string): number | null {
  // Try to match pure numeric ID (e.g., "1405")
  if (/^\d+$/.test(slug)) {
    return parseInt(slug, 10);
  }

  // Try to match ID at the end (e.g., "dexter-1405")
  let match = slug.match(/-(\d+)$/);
  if (match) {
    return parseInt(match[1], 10);
  }

  // Try to match ID at the beginning (e.g., "1405-dexter")
  match = slug.match(/^(\d+)-/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return null;
}
