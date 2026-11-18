"use client";

import { useSyncExternalStore } from "react";
import { toast } from "@/components/Toast";
import { useT } from "@/i18n/LocaleProvider";
import {
  DEFAULT_PROFILE_ID,
  getActiveProfileId,
  subscribeProfiles,
} from "@/lib/profiles";

const getServerProfileId = () => DEFAULT_PROFILE_ID;

/** The thing to review, as the Czech sentence needs it (accusative). */
const SUBJECT_CS: Record<"title" | "list" | "goal", string> = {
  title: "titul",
  list: "seznam",
  goal: "cíl",
};

/** Keep a rendered action attached to its profile until its storage events arrive. */
export function useProfileGuard(subject: "title" | "list" | "goal" = "title") {
  const t = useT();
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
        t(
          "Could not check your active profile. Reload the page and try again.",
          "Aktivní profil se nepodařilo ověřit. Načtěte stránku znovu a zkuste to ještě jednou.",
        ),
        "error",
      );
      return false;
    }

    toast.showToast(
      t(
        `Your active profile changed. Review the current ${subject} and try again.`,
        `Aktivní profil se změnil. Zkontrolujte aktuální ${SUBJECT_CS[subject]} a zkuste to znovu.`,
      ),
      "info",
    );
    return false;
  }

  return { profileId, checkProfile };
}
