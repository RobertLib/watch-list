"use client";

import { MAX_SHARED_LIST_ITEMS, type SharedListRef } from "./shared-list";
import { mediaItemKey } from "./utils";
import type { MediaType } from "@/types/tmdb";

/**
 * Named lists of the visitor's own making.
 *
 * The watchlist answers one question – what do I still mean to watch – and it can
 * only ever answer that one. "Films to show my dad", "best of this year", "the
 * horror run for October" are all different questions, and stuffing them into one
 * list is what makes a watchlist stop being useful at eighty titles.
 *
 * They are also the most shareable thing here: a named list is worth sending in a
 * way a raw watchlist is not, and it goes out through the same URL encoding the
 * rest of the app uses, so sharing one still costs no server-side record.
 */

export const COLLECTIONS_STORAGE_KEY = "collections";

export interface CollectionItem {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
}

export interface Collection {
  /** Local, opaque, and only ever generated here. */
  id: string;
  name: string;
  items: CollectionItem[];
  createdAt: string;
  updatedAt: string;
}

export const MAX_COLLECTIONS = 40;
export const MAX_COLLECTION_NAME_LENGTH = 60;
/** A collection is meant to be shareable, so it inherits the share-link bound. */
export const MAX_COLLECTION_ITEMS = MAX_SHARED_LIST_ITEMS;

const MAX_TITLE_LENGTH = 200;
const EMPTY: Collection[] = [];

function sanitizeName(value: unknown): string {
  if (typeof value !== "string") return "";

  // Control characters stripped: a name reaches page headings and share links.
  return value
    .replace(/[\p{C}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_COLLECTION_NAME_LENGTH);
}

function sanitizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return fallback;
  }
  return value;
}

function sanitizeItems(input: unknown): CollectionItem[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const items: CollectionItem[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;

    const { id, mediaType, title, posterPath } = entry as Record<
      string,
      unknown
    >;

    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) continue;
    if (mediaType !== "movie" && mediaType !== "tv") continue;

    const key = mediaItemKey(id, mediaType);
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      id,
      mediaType,
      title: typeof title === "string" ? title.slice(0, MAX_TITLE_LENGTH) : "",
      posterPath: typeof posterPath === "string" ? posterPath : null,
    });

    if (items.length >= MAX_COLLECTION_ITEMS) break;
  }

  return items;
}

/**
 * Rebuild stored collections from the fields we understand.
 *
 * One malformed list must not take the others with it – these are the only copy
 * that exists, so each is repaired or dropped on its own.
 */
export function sanitizeCollections(input: unknown): Collection[] {
  if (!Array.isArray(input)) return [];

  const collections: Collection[] = [];
  const seenIds = new Set<string>();

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.slice(0, 64) : "";
    const name = sanitizeName(record.name);

    // Without an id there is nothing to address the list by, and a nameless list
    // cannot be told from the others.
    if (!id || !name || seenIds.has(id)) continue;
    seenIds.add(id);

    const createdAt = sanitizeTimestamp(record.createdAt, "");

    collections.push({
      id,
      name,
      items: sanitizeItems(record.items),
      createdAt,
      updatedAt: sanitizeTimestamp(record.updatedAt, createdAt),
    });

    if (collections.length >= MAX_COLLECTIONS) break;
  }

  return collections;
}

export function getCollections(): Collection[] {
  if (typeof window === "undefined") return EMPTY;

  try {
    const stored = window.localStorage.getItem(COLLECTIONS_STORAGE_KEY);
    if (!stored) return EMPTY;

    return sanitizeCollections(JSON.parse(stored));
  } catch (error) {
    console.error("Error parsing collections from storage:", error);
    return EMPTY;
  }
}

export function saveCollections(collections: Collection[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      COLLECTIONS_STORAGE_KEY,
      JSON.stringify(collections),
    );
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving collections to storage:", error);
  }

  notifyCollectionsChanged();
}

/**
 * A local id.
 *
 * `crypto.randomUUID` where it exists, which is everywhere this app runs outside
 * of insecure contexts – and a timestamp-plus-counter where it does not, which
 * only has to be unique within one browser's storage.
 */
let idCounter = 0;
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  idCounter += 1;
  return `c${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function createCollection(
  collections: Collection[],
  name: string,
  items: CollectionItem[] = [],
  now: string = new Date().toISOString(),
): Collection[] {
  const clean = sanitizeName(name);
  if (!clean || collections.length >= MAX_COLLECTIONS) return collections;

  return [
    {
      id: newId(),
      name: clean,
      items: sanitizeItems(items),
      createdAt: now,
      updatedAt: now,
    },
    ...collections,
  ];
}

export function renameCollection(
  collections: Collection[],
  id: string,
  name: string,
  now: string = new Date().toISOString(),
): Collection[] {
  const clean = sanitizeName(name);
  if (!clean) return collections;

  return collections.map((collection) =>
    collection.id === id
      ? { ...collection, name: clean, updatedAt: now }
      : collection,
  );
}

export function deleteCollection(
  collections: Collection[],
  id: string,
): Collection[] {
  return collections.filter((collection) => collection.id !== id);
}

/** Add a title, or leave the list alone if it is already there or full. */
export function addToCollection(
  collections: Collection[],
  id: string,
  item: CollectionItem,
  now: string = new Date().toISOString(),
): Collection[] {
  return collections.map((collection) => {
    if (collection.id !== id) return collection;
    if (collection.items.length >= MAX_COLLECTION_ITEMS) return collection;

    const key = mediaItemKey(item.id, item.mediaType);
    const exists = collection.items.some(
      (existing) => mediaItemKey(existing.id, existing.mediaType) === key,
    );
    if (exists) return collection;

    return {
      ...collection,
      items: [...collection.items, ...sanitizeItems([item])],
      updatedAt: now,
    };
  });
}

export function removeFromCollection(
  collections: Collection[],
  id: string,
  itemId: number,
  mediaType: MediaType,
  now: string = new Date().toISOString(),
): Collection[] {
  const key = mediaItemKey(itemId, mediaType);

  return collections.map((collection) =>
    collection.id === id
      ? {
          ...collection,
          items: collection.items.filter(
            (item) => mediaItemKey(item.id, item.mediaType) !== key,
          ),
          updatedAt: now,
        }
      : collection,
  );
}

export function isInCollection(
  collection: Collection,
  id: number,
  mediaType: MediaType,
): boolean {
  const key = mediaItemKey(id, mediaType);
  return collection.items.some(
    (item) => mediaItemKey(item.id, item.mediaType) === key,
  );
}

/** The refs a share link needs, in the order the list holds them. */
export function toSharedRefs(collection: Collection): SharedListRef[] {
  return collection.items.map((item) => ({
    id: item.id,
    mediaType: item.mediaType,
  }));
}

// ── Storage, exposed as an external store ────────────────────────────────────
//
// So a list created on one page shows up on another without a reload, and so
// there is only ever one copy of the truth.

const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedCollections: Collection[] = EMPTY;

function notifyCollectionsChanged(): void {
  for (const listener of listeners) listener();
}

export function subscribeToCollections(onChange: () => void): () => void {
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    // `key` is null when the whole store was cleared, which concerns us too.
    if (event.key !== null && event.key !== COLLECTIONS_STORAGE_KEY) return;
    onChange();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getCollectionsSnapshot(): Collection[] {
  if (typeof window === "undefined") return EMPTY;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(COLLECTIONS_STORAGE_KEY);
  } catch {
    return EMPTY;
  }

  // Compared by identity by `useSyncExternalStore`, so the parse is memoised
  // against the raw string – parsing every call would spin forever.
  if (raw === cachedRaw) return cachedCollections;

  cachedRaw = raw;
  cachedCollections = EMPTY;

  if (raw) {
    try {
      cachedCollections = sanitizeCollections(JSON.parse(raw));
    } catch (error) {
      console.error("Error parsing collections from storage:", error);
    }
  }

  return cachedCollections;
}

/** The server has no storage, so it knows of no lists. */
export function getServerCollectionsSnapshot(): Collection[] {
  return EMPTY;
}
