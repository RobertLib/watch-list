# Vercel Analytics Events

This document describes all tracked events in the application for Vercel Web Analytics.

## Events Overview

### 1. Watchlist Events

#### `watchlist_add`

Tracks when an item is added to the watchlist.

**Parameters:**

- `media_id`: ID of the movie/TV show
- `media_type`: "movie" or "tv"
- `title`: Title of the movie/TV show

**Tracked in:**

- WatchlistButton component on successful addition

#### `watchlist_remove`

Tracks when an item is removed from the watchlist.

**Parameters:**

- `media_id`: ID of the movie/TV show
- `media_type`: "movie" or "tv"
- `title`: Title of the movie/TV show

**Tracked in:**

- WatchlistButton component on successful removal

---

### 2. Region & Provider Events

#### `region_change`

Tracks when a user changes their region.

**Parameters:**

- `region_code`: Region code (e.g., "US", "CZ")
- `region_name`: Region name (e.g., "United States", "Czech Republic")

**Tracked in:**

- RegionSelector component when selecting a new region

#### `provider_selection`

Tracks streaming provider selection.

**Parameters:**

- `provider_count`: Number of selected providers
- `region`: Current region
- `provider_ids`: List of selected provider IDs (comma-separated)

**Tracked in:**

- StreamingProviderSelector when selection changes
- "Select All", "Select None", "Select Top 7" buttons

---

### 3. Filter Events

#### `filter_apply`

Tracks when a filter is applied.

**Parameters:**

- `filter_type`: Type of filter (e.g., "sort_by", "year", "genre", "min_rating", "language")
- `filter_value`: Filter value
- `media_type`: "movie" or "tv"

**Tracked in:**

- FilterBar component when any filter changes

#### `filter_clear`

Tracks when all filters are cleared.

**Parameters:**

- `media_type`: "movie" or "tv"

**Tracked in:**

- FilterBar component when clicking "Clear Filters"

---

### 4. Video Events

#### `video_play`

Tracks when a video trailer is played.

**Parameters:**

- `media_id`: ID of the movie/TV show
- `media_type`: "movie" or "tv"
- `title`: Title of the movie/TV show
- `video_type`: Type of video (e.g., "Trailer", "Teaser")

**Tracked in:**

- useVideoOverlay hook when opening a video
- Used in: HeroButtons, MediaCard, MovieTrailerButton, TVTrailerButton

---

### 5. Navigation & Discovery Events

#### `media_detail_view`

Tracks when a movie/TV show detail page is viewed.

**Parameters:**

- `media_id`: ID of the movie/TV show
- `media_type`: "movie" or "tv"
- `title`: Title of the movie/TV show

**Tracked in:**

- MediaDetailTracker component on movie and TV show detail pages

#### `genre_view`

Tracks when a specific genre page is viewed.

**Parameters:**

- `genre_id`: Genre ID
- `genre_name`: Genre name
- `media_type`: "movie" or "tv"

**Tracked in:**

- Ready for use on genre pages

#### `load_more`

Tracks when "Load More" button is clicked.

**Parameters:**

- `page`: Page number
- `section`: Section name (e.g., "popular_movies", "trending_tv")
- `media_type`: "movie" or "tv" (optional)

**Tracked in:**

- Ready for use in LoadMoreButton component

#### `carousel_interaction`

Tracks interaction with carousel sections.

**Parameters:**

- `carousel_type`: Carousel type (e.g., "trending", "popular")
- `action`: "scroll" or "click"
- `item_index`: Item index (optional)

**Tracked in:**

- Ready for use in MediaCarousel component

---

## Implementation

All tracking functions are centralized in `/src/lib/analytics.ts`. They use the Vercel Analytics `track()` function.

### Usage

```typescript
import { trackWatchlistAdd } from "@/lib/analytics";

// Example usage
trackWatchlistAdd(123, "movie", "Inception");
```

## Viewing Data

You can view the data in:

1. Vercel Dashboard → Your Project → Analytics
2. "Events" section for custom events
3. Filter and group by individual parameters

## Notes

- All events are tracked on the client-side
- Events are automatically aggregated by Vercel
- Data is available in real-time
- Respects user privacy (no cookies, anonymous tracking)
