"use client";

import { LayoutGrid, List } from "lucide-react";
import { useViewMode } from "@/hooks/useViewMode";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/lib/view-mode";

const OPTIONS: {
  mode: ViewMode;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { mode: "card", label: "Cards", icon: LayoutGrid },
  { mode: "list", label: "List", icon: List },
];

interface ViewModeToggleProps {
  className?: string;
}

/**
 * Switches every listing on the page between posters and rows. The choice is
 * remembered, so it also decides how the next page renders.
 */
export function ViewModeToggle({ className }: ViewModeToggleProps) {
  const { viewMode, setViewMode } = useViewMode();

  return (
    <div
      role="group"
      aria-label="Layout"
      className={cn(
        "inline-flex items-center gap-1 rounded-lg bg-gray-800 p-1",
        className,
      )}
    >
      {OPTIONS.map(({ mode, label, icon: Icon }) => {
        const isActive = mode === viewMode;

        return (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            aria-pressed={isActive}
            title={`${label} view`}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              isActive
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white",
            )}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
