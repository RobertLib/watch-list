import { track } from "@vercel/analytics";

// Watchlist events
export const trackWatchlistAdd = (
  mediaId: number,
  mediaType: "movie" | "tv",
  title: string
) => {
  track("watchlist_add", {
    media_id: mediaId.toString(),
    media_type: mediaType,
    title: title,
  });
};

export const trackWatchlistRemove = (
  mediaId: number,
  mediaType: "movie" | "tv",
  title: string
) => {
  track("watchlist_remove", {
    media_id: mediaId.toString(),
    media_type: mediaType,
    title: title,
  });
};

// Region & Provider events
export const trackRegionChange = (region: string, regionName: string) => {
  track("region_change", {
    region_code: region,
    region_name: regionName,
  });
};

export const trackProviderSelection = (
  providerIds: number[],
  providerCount: number,
  region: string
) => {
  track("provider_selection", {
    provider_count: providerCount.toString(),
    region: region,
    provider_ids: providerIds.join(","),
  });
};

// Filter events
export const trackFilterApply = (
  filterType: string,
  filterValue: string,
  mediaType: "movie" | "tv"
) => {
  track("filter_apply", {
    filter_type: filterType,
    filter_value: filterValue,
    media_type: mediaType,
  });
};

export const trackFilterClear = (mediaType: "movie" | "tv") => {
  track("filter_clear", {
    media_type: mediaType,
  });
};

// Video events
export const trackVideoPlay = (
  mediaId: number,
  mediaType: "movie" | "tv",
  title: string,
  videoType: string
) => {
  track("video_play", {
    media_id: mediaId.toString(),
    media_type: mediaType,
    title: title,
    video_type: videoType,
  });
};

// Navigation events
export const trackGenreView = (
  genreId: number,
  genreName: string,
  mediaType: "movie" | "tv"
) => {
  track("genre_view", {
    genre_id: genreId.toString(),
    genre_name: genreName,
    media_type: mediaType,
  });
};

export const trackMediaDetailView = (
  mediaId: number,
  mediaType: "movie" | "tv",
  title: string
) => {
  track("media_detail_view", {
    media_id: mediaId.toString(),
    media_type: mediaType,
    title: title,
  });
};

// Search & Discovery events
export const trackLoadMore = (
  page: number,
  section: string,
  mediaType?: "movie" | "tv"
) => {
  track("load_more", {
    page: page.toString(),
    section: section,
    ...(mediaType && { media_type: mediaType }),
  });
};

export const trackCarouselInteraction = (
  carouselType: string,
  action: "scroll" | "click",
  itemIndex?: number
) => {
  track("carousel_interaction", {
    carousel_type: carouselType,
    action: action,
    ...(itemIndex !== undefined && { item_index: itemIndex.toString() }),
  });
};
