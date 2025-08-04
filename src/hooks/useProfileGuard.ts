"use client";

import { useSyncExternalStore } from "react";
import { toast } from "@/components/Toast";
import {
  DEFAULT_PROFILE_ID,
  getActiveProfileId,
  subscribeProfiles,
} from "@/lib/profiles";

const getServerProfileId = () => DEFAULT_PROFILE_ID;

/** Keep a rendered action attached to its profile until its storage events arrive. */
export function useProfileGuard(subject: "title" | "list" | "goal" = "title") {
  const profileId = useSyncExternalStore(
    subscribeProfiles,
    getActiveProfileId,
    getServerProfileId,
  );

  function checkProfile(expectedId: string = profileId): boolean {
    try {
      if (getActiveProfileId({ strict: true }) === expectedId) return true;
    } catch {
      toast.showToast(
        "Could not check your active profile. Reload the page and try again.",
        "error",
      );
      return false;
    }

    toast.showToast(
      `Your active profile changed. Review the current ${subject} and try again.`,
      "info",
    );
    return false;
  }

  return { profileId, checkProfile };
}
