"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTransientFlag } from "@/hooks/useTransientFlag";
import { useProfileGuard } from "@/hooks/useProfileGuard";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { toast } from "@/components/Toast";
import { storageRefusedMessage } from "@/lib/media-list";
import { isInWatchlist as isStoredInWatchlist } from "@/lib/watchlist";
import { withProfileStorage } from "@/lib/profile-storage";
import { MediaItem } from "@/types/tmdb";
import { useLocale, useT } from "@/i18n/LocaleProvider";

interface WatchlistButtonProps {
  item: MediaItem;
  variant?: "default" | "compact" | "large";
  className?: string;
}

export function WatchlistButton({
  item,
  variant = "default",
  className,
}: WatchlistButtonProps) {
  const { addItem, removeItem, isInWatchlist, refreshWatchlist, profileId } = useWatchlist();
  const { checkProfile } = useProfileGuard();
  const locale = useLocale();
  const t = useT();
  const [isAnimating, animate] = useTransientFlag(300);
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  // Prevent hydration mismatch by not showing state-dependent content on server
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const inWatchlist = isMounted
    ? isInWatchlist(item.id, item.media_type as "movie" | "tv")
    : false;

  const storageRefused = storageRefusedMessage(locale);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (saving.current || !checkProfile(profileId)) return;
    const current = withProfileStorage(profileId, () => {
      if (isStoredInWatchlist(item.id, item.media_type) !== inWatchlist) {
        refreshWatchlist();
        toast.showToast(
          t(
            "Your watchlist changed. Review the current title and try again.",
            "Váš seznam se mezitím změnil. Zkontrolujte titul a zkuste to znovu.",
          ),
          "info",
        );
        return false;
      }
      return true;
    });
    if (!current) return;

    saving.current = true;
    setIsSaving(true);
    try {
      animate();

      if (inWatchlist) {
        const result = await removeItem(item.id, item.media_type as "movie" | "tv");
        if (result === "ok") {
          toast.showToast(
            t(
              `Removed "${item.title}" from watchlist`,
              `Odebráno ze seznamu: „${item.title}“`,
            ),
            "success",
          );
        } else {
          toast.showToast(storageRefused, "error");
        }
      } else {
        const result = await addItem(item);
        if (result === "ok") {
          toast.showToast(
            t(
              `Added "${item.title}" to watchlist`,
              `Přidáno na seznam: „${item.title}“`,
            ),
            "success",
          );
        } else if (result === "duplicate") {
          toast.showToast(
            t(
              `"${item.title}" is already in your watchlist`,
              `„${item.title}“ už na seznamu máte`,
            ),
            "info",
          );
        } else {
          toast.showToast(storageRefused, "error");
        }
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
      // Not native `disabled`: browsers blur a disabled button, so saving a
      // title from the keyboard dropped focus. `handleClick` refuses a repeat.
      aria-disabled={isSaving}
      aria-busy={isSaving}
      className={cn(
        "group relative bg-black/70 backdrop-blur-sm rounded-full transition-all duration-300 hover:bg-black/80 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-transparent",
        getVariantStyles(),
        isAnimating && "scale-125",
        isMounted && inWatchlist && "bg-red-600/80 hover:bg-red-600/90",
        "aria-disabled:cursor-wait",
        className,
      )}
      aria-label={
        isMounted
          ? inWatchlist
            ? t(
                `Remove ${item.title} from watchlist`,
                `Odebrat ${item.title} ze seznamu`,
              )
            : t(
                `Add ${item.title} to watchlist`,
                `Přidat ${item.title} na seznam`,
              )
          : t("Toggle watchlist", "Přidat na seznam, nebo odebrat")
      }
      title={
        isMounted
          ? inWatchlist
            ? t("Remove from watchlist", "Odebrat ze seznamu")
            : t("Add to watchlist", "Přidat na seznam")
          : t("Watchlist", "Seznam")
      }
    >
      <div className="relative">
        {isMounted && inWatchlist ? (
          <Heart
            className={cn(
              "text-white fill-current transition-all duration-300",
              getIconSize(),
              isAnimating && "scale-110",
            )}
            aria-hidden="true"
          />
        ) : (
          <Heart
            className={cn(
              "text-white transition-all duration-300 hover:fill-white hover:text-white",
              getIconSize(),
            )}
            aria-hidden="true"
          />
        )}
      </div>
    </button>
  );
}
