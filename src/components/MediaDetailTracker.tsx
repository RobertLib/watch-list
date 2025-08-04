"use client";

import { useEffect } from "react";
import { trackMediaDetailView } from "@/lib/analytics";

interface MediaDetailTrackerProps {
  mediaId: number;
  mediaType: "movie" | "tv";
  title: string;
}

export function MediaDetailTracker({
  mediaId,
  mediaType,
  title,
}: MediaDetailTrackerProps) {
  useEffect(() => {
    trackMediaDetailView(mediaId, mediaType, title);
  }, [mediaId, mediaType, title]);

  return null;
}
