"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Check, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  duration?: number;
}

interface ToastContextType {
  showToast: (
    message: string,
    type?: "success" | "error" | "info",
    duration?: number,
  ) => void;
}

let toastListeners: ((toast: Toast) => void)[] = [];

/**
 * A key React can tell two toasts apart by, and nothing more.
 *
 * `crypto.randomUUID()` for the same reason `profiles.ts` uses it: the previous
 * `Math.random().toString(36).substr(2, 9)` leaned on a deprecated method to
 * build an id that could, rarely, collide – and two toasts sharing a key is a
 * dismissal that closes the wrong one.
 */
let idCounter = 0;
function newToastId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  idCounter += 1;
  return `t${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export const toast: ToastContextType = {
  showToast: (message: string, type = "info", duration = 3000) => {
    const newToast: Toast = { id: newToastId(), message, type, duration };
    toastListeners.forEach((listener) => listener(newToast));
  },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  /**
   * The pending auto-dismissals, so they can be cancelled.
   *
   * Every other timer in this app is cleared by the effect that started it; this
   * one was not, and it is the one timer that outlives what it refers to. A toast
   * closed by hand left its timer running to filter a list the toast had already
   * left, and unmounting the container left every outstanding timer holding a
   * `setToasts` for state that no longer existed.
   */
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    // Read into a local so the cleanup below closes over the map itself rather
    // than over a ref it re-reads after the component is gone.
    const timers = timersRef.current;

    const addToast = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);

      timers.set(
        toast.id,
        setTimeout(() => {
          timers.delete(toast.id);
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, toast.duration),
      );
    };

    toastListeners.push(addToast);

    return () => {
      toastListeners = toastListeners.filter(
        (listener) => listener !== addToast,
      );

      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const getToastIcon = (type: string) => {
    switch (type) {
      case "success":
        return <Check className="w-4 h-4" aria-hidden="true" />;
      case "error":
        return <X className="w-4 h-4" aria-hidden="true" />;
      default:
        return <Heart className="w-4 h-4" aria-hidden="true" />;
    }
  };

  const getToastStyles = (type: string) => {
    switch (type) {
      case "success":
        return "bg-green-600 border-green-500";
      case "error":
        return "bg-red-600 border-red-500";
      default:
        return "bg-blue-600 border-blue-500";
    }
  };

  return (
    // One live region, not two. The container used to be `aria-live="polite"`
    // as well, so every toast was announced twice – once by the region it
    // landed in and once by its own `alert` role. The region keeps its name so
    // a reader can find the notifications; each toast does the announcing.
    <div
      className="fixed top-20 right-4 left-4 md:right-4 md:left-auto z-50 space-y-2 md:max-w-96"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm text-white w-full md:min-w-80 md:max-w-96 shadow-lg animate-in slide-in-from-right-full",
            getToastStyles(toast.type),
          )}
          // `alert` already implies `aria-live="assertive"`; spelling it out
          // was the other half of the double announcement.
          role="alert"
        >
          <div className="shrink-0">{getToastIcon(toast.type)}</div>
          <p className="flex-1 text-sm font-medium">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 p-1 hover:bg-white/20 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50"
            aria-label="Dismiss notification"
          >
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
