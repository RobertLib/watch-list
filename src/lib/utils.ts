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
 * From "movie-title-123" returns 123
 */
export function extractIdFromSlug(slug: string): number | null {
  const match = slug.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}
