"use client";

import { useRef, useState } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTransientFlag } from "@/hooks/useTransientFlag";
import { useProfileGuard } from "@/hooks/useProfileGuard";
import { useWatched } from "@/contexts/WatchedContext";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { toast } from "@/components/Toast";
import { storageRefusedMessage } from "@/lib/media-list";
import { setTitleWatched } from "@/lib/watched-actions";
import { MediaItem } from "@/types/tmdb";
import { useLocale, useT } from "@/i18n/LocaleProvider";

interface WatchedButtonProps {
  item: MediaItem;
  variant?: "default" | "compact" | "large";
  className?: string;
}

export function WatchedButton({
  item,
  variant = "default",
  className,
}: WatchedButtonProps) {
  const { isWatched, refreshWatched, profileId } = useWatched();
  const { refreshWatchlist, profileId: watchlistProfileId } = useWatchlist();
  const { checkProfile } = useProfileGuard();
  const locale = useLocale();
  const t = useT();
  const [isAnimating, animate] = useTransientFlag(300);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);

  const watched = isWatched(item.id, item.media_type);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (saving.current || !checkProfile(profileId)) return;
    if (!watched && watchlistProfileId !== profileId) {
      toast.showToast(
        t(
          "Your active profile changed. Review the current title and try again.",
          "Aktivní profil se mezitím změnil. Zkontrolujte titul a zkuste to znovu.",
        ),
        "info",
      );
      return;
    }
    saving.current = true;
    setIsSaving(true);
    try {
      animate();
      const result = await setTitleWatched(profileId, item, watched);
      // Refresh outside the write scope: the active owner may have changed
      // while the complete action was waiting behind a restore or deletion.
      refreshWatched();
      refreshWatchlist();
      if (result.status === "profile-unavailable") {
        toast.showToast(
          t(
            "The profile for this action was deleted. Review the current title and try again.",
            "Profil, ke kterému akce patřila, byl smazán. Zkontrolujte titul a zkuste to znovu.",
          ),
          "info",
        );
      } else if (result.status === "changed") {
        toast.showToast(
          t(
            "Your watched list changed. Review the current title and try again.",
            "Vaše zhlédnuté tituly se mezitím změnily. Zkontrolujte titul a zkuste to znovu.",
          ),
          "info",
        );
      } else if (result.status === "failed") {
        toast.showToast(
          storageRefusedMessage(locale),
          "error",
        );
      } else if (result.status === "watchlist-failed") {
        toast.showToast(
          t(
            `Marked "${item.title}" as watched, but your browser would not remove it from your watchlist`,
            `Označeno jako zhlédnuté: „${item.title}“. Prohlížeč to ale neodebral ze seznamu.`,
          ),
          "error",
        );
      } else if (result.status === "ok") {
        toast.showToast(
          watched
            ? t(
                `Removed "${item.title}" from watched`,
                `Odebráno ze zhlédnutých: „${item.title}“`,
              )
            : result.removedFromWatchlist
              ? t(
                  `Marked "${item.title}" as watched and removed it from your watchlist`,
                  `Označeno jako zhlédnuté a odebráno ze seznamu: „${item.title}“`,
                )
              : t(
                  `Marked "${item.title}" as watched`,
                  `Označeno jako zhlédnuté: „${item.title}“`,
                ),
          "success",
        );
      }
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case "compact":
        return "p-1.5";
      case "large":
        return "p-3 text-base";
      default:
        return "p-2";
    }
  };

  const getIconSize = () => {
    switch (variant) {
      case "compact":
        return "w-3 h-3";
      case "large":
        return "w-6 h-6";
      default:
        return "w-4 h-4";
    }
  };

  return (
    <button
      onClick={handleClick}
      // Not native `disabled`: browsers blur a disabled button, so marking a
      // title from the keyboard dropped focus. `handleClick` refuses a repeat.
      aria-disabled={isSaving}
      aria-busy={isSaving}
      className={cn(
        "group relative bg-black/70 backdrop-blur-sm rounded-full transition-all duration-300 hover:bg-black/80 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-transparent",
        getVariantStyles(),
        isAnimating && "scale-125",
        watched && "bg-green-600/80 hover:bg-green-600/90",
        "aria-disabled:cursor-wait",
        className,
      )}
      // The name says what pressing it does, and so carries the state with
      // it – which is why there is no `aria-pressed` alongside. The two
      // together announced "Mark Fight Club as not watched, pressed", a
      // toggle whose label flips as well as its state. The heart next to it
      // is built the same way.
      aria-label={
        watched
          ? t(
              `Mark ${item.title} as not watched`,
              `Označit ${item.title} jako nezhlédnuté`,
            )
          : t(
              `Mark ${item.title} as watched`,
              `Označit ${item.title} jako zhlédnuté`,
            )
      }
      title={
        watched
          ? t("Watched – click to undo", "Zhlédnuto – kliknutím vrátíte zpět")
          : t("Mark as watched", "Označit jako zhlédnuté")
      }
    >
      <Eye
        className={cn(
          "text-white transition-all duration-300",
          getIconSize(),
          isAnimating && "scale-110",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
