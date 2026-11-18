"use client";

import { Clapperboard, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WatchProviderFilter } from "@/lib/watch-provider-settings";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { pick, type Localized } from "@/i18n/locale";

const OPTIONS: {
  value: WatchProviderFilter;
  label: Localized;
  description: Localized;
  icon: typeof Tv;
}[] = [
  {
    value: "all",
    label: { en: "Everything", cs: "Vše" },
    description: {
      en: "All movies and shows, wherever they are available",
      cs: "Všechny filmy a seriály, ať jsou k vidění kdekoli",
    },
    icon: Clapperboard,
  },
  {
    value: "streaming-only",
    label: { en: "Only my platforms", cs: "Jen moje služby" },
    description: {
      en: "Just titles you can stream on the platforms you pick",
      cs: "Jen tituly, které můžete streamovat na vybraných službách",
    },
    icon: Tv,
  },
];

interface WatchProviderFilterSelectorProps {
  value: WatchProviderFilter;
  onChange: (filter: WatchProviderFilter) => void;
  /**
   * Unavailable while a change is being saved. The radios stay focusable and
   * changes are not passed on: arrow keys move and select a radio in one step,
   * and native `disabled` blurred the radio that had just been chosen.
   */
  disabled?: boolean;
}

export function WatchProviderFilterSelector({
  value,
  onChange,
  disabled = false,
}: WatchProviderFilterSelectorProps) {
  const locale = useLocale();
  const t = useT();

  return (
    <fieldset aria-disabled={disabled || undefined}>
      <legend className="sr-only">
        {t("Choose what to show", "Vyberte, co zobrazit")}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const isSelected = value === option.value;
          const Icon = option.icon;

          return (
            <label key={option.value} className={disabled ? "cursor-wait" : "cursor-pointer"}>
              <input
                type="radio"
                name="watch-provider-filter"
                value={option.value}
                checked={isSelected}
                aria-disabled={disabled || undefined}
                onChange={() => {
                  // The controlled `checked` puts the saved choice back.
                  if (!disabled) onChange(option.value);
                }}
                className="peer sr-only"
              />
              <div
                className={cn(
                  "flex h-full items-start gap-3 rounded-lg border-2 p-4 transition-colors",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-red-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-gray-900",
                  disabled && "opacity-60",
                  isSelected
                    ? "border-red-500 bg-red-500/10"
                    : "border-gray-700 bg-gray-800/50 hover:border-gray-600",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    isSelected ? "text-red-400" : "text-gray-400",
                  )}
                  aria-hidden="true"
                />
                <div>
                  <div className="font-medium text-white">
                    {pick(locale, option.label)}
                  </div>
                  <div className="text-sm text-gray-400">
                    {pick(locale, option.description)}
                  </div>
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
