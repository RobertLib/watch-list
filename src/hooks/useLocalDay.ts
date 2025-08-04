"use client";

import { useSyncExternalStore } from "react";
import { todayLocal } from "@/lib/dates";

const MIDNIGHT_SLACK_MS = 50;

function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const arm = () => {
    if (timer !== null) clearTimeout(timer);
    const now = new Date();
    // Construct the next local midnight: a DST day need not be 24 hours long.
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(() => {
      onChange();
      arm();
    }, Math.max(0, midnight.getTime() - now.getTime()) + MIDNIGHT_SLACK_MS);
  };
  arm();

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    onChange();
    arm();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    if (timer !== null) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

// A static export cannot know the visitor's day or timezone. Hydration starts
// from the same empty snapshot, then reads the browser's local calendar.
const getServerDay = () => "";

export function useLocalDay(): string {
  return useSyncExternalStore(subscribe, todayLocal, getServerDay);
}
