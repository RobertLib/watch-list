"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Check, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextType {
  showToast: (
    message: string,
    type?: ToastType,
    duration?: number,
  ) => void;
}

/**
 * How long each kind stays up when the caller does not say.
 *
 * An error is the one message somebody has to act on – usually "your browser
 * refused to save that" – and it is longer than a confirmation, so it gets more
 * than the three seconds a "Saved" needs. Either way the clock stops while the
 * pointer or keyboard focus is on the notifications (see `ToastContainer`).
 */
const DEFAULT_DURATION_MS: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  error: 8000,
};

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
  showToast: (message: string, type: ToastType = "info", duration?: number) => {
    const newToast: Toast = {
      id: newToastId(),
      message,
      type,
      duration: duration ?? DEFAULT_DURATION_MS[type],
    };
    toastListeners.forEach((listener) => listener(newToast));
  },
};

/** One toast's auto-dismissal, which can be stopped and picked up again. */
interface DismissTimer {
  /** The pending timeout, or null while paused. */
  handle: ReturnType<typeof setTimeout> | null;
  /** How long the toast still has to stay up once the clock runs. */
  remaining: number;
  /** When the current `handle` was started. */
  startedAt: number;
}

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
  const timersRef = useRef(new Map<string, DismissTimer>());
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Whether the clocks are stopped: while the pointer is over the notifications
   * or keyboard focus is inside them. A toast that vanishes mid-sentence, or
   * while its dismiss button is being reached for, was the fixed three seconds'
   * whole failure – reading speed is the visitor's, not ours (WCAG 2.2.1).
   */
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const pausedRef = useRef(false);

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      if (timer.handle !== null) clearTimeout(timer.handle);
      timersRef.current.delete(id);
    }

    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Timers are replaced rather than edited in place: each pause or resume
  // writes a fresh record into the map.
  const startTimer = useCallback((id: string, remaining: number) => {
    timersRef.current.set(id, {
      handle: setTimeout(() => removeToast(id), remaining),
      remaining,
      startedAt: Date.now(),
    });
  }, [removeToast]);

  const syncPause = useCallback(() => {
    const shouldPause = hoveredRef.current || focusedRef.current;
    if (shouldPause === pausedRef.current) return;
    pausedRef.current = shouldPause;

    const now = Date.now();
    const timers = timersRef.current;
    for (const [id, timer] of timers) {
      if (shouldPause) {
        if (timer.handle === null) continue;
        clearTimeout(timer.handle);
        timers.set(id, {
          handle: null,
          remaining: Math.max(0, timer.remaining - (now - timer.startedAt)),
          startedAt: timer.startedAt,
        });
      } else if (timer.handle === null) {
        startTimer(id, timer.remaining);
      }
    }
  }, [startTimer]);

  useEffect(() => {
    // Read into a local so the cleanup below closes over the map itself rather
    // than over a ref it re-reads after the component is gone.
    const timers = timersRef.current;

    const addToast = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);

      // One arriving while the others are held waits with them.
      if (pausedRef.current) {
        timers.set(toast.id, { handle: null, remaining: toast.duration, startedAt: 0 });
      } else {
        startTimer(toast.id, toast.duration);
      }
    };

    toastListeners.push(addToast);

    return () => {
      toastListeners = toastListeners.filter(
        (listener) => listener !== addToast,
      );

      for (const timer of timers.values()) {
        if (timer.handle !== null) clearTimeout(timer.handle);
      }
      timers.clear();
    };
  }, [startTimer]);

  // Dismissing a toast removes the button that had focus, and browsers do not
  // reliably send a `blur` for a removed element – nor a `mouseleave` when the
  // last toast disappears from under a still pointer. Without this check the
  // clocks could stay stopped for every toast that comes after.
  useEffect(() => {
    if (toasts.length === 0) hoveredRef.current = false;
    if (focusedRef.current && !containerRef.current?.contains(document.activeElement)) {
      focusedRef.current = false;
    }
    syncPause();
  }, [toasts, syncPause]);

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

  const renderToast = (toast: Toast) => (
    <div
      key={toast.id}
      className={cn(
        "flex items-center gap-3 px-4 py-3 mb-2 rounded-lg border backdrop-blur-sm text-white w-full md:min-w-80 md:max-w-96 shadow-lg animate-in slide-in-from-right-full",
        getToastStyles(toast.type),
      )}
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
  );

  return (
    // A named region holding two live regions, one per urgency. Every toast
    // used to be its own `role="alert"`, so "Added to your watchlist" cut into
    // whatever a screen reader was saying exactly as "Could not save" did.
    // Confirmations now wait their turn (`status`, polite); only failures
    // interrupt (`alert`, assertive), and they sit at the top of the stack.
    //
    // The two regions are always rendered, even empty, and toasts are added
    // into them: a live region that is inserted already holding its message is
    // not reliably announced, which is what per-toast roles relied on. Neither
    // is atomic, so a new toast is read on its own rather than with the whole
    // stack again. The outer region stays a plain landmark – when it was live
    // as well, every toast was announced twice. Each toast carries its own
    // margin rather than the stack a gap, so an empty region takes up no room.
    <div
      ref={containerRef}
      className="fixed top-20 right-4 left-4 md:right-4 md:left-auto z-50 md:max-w-96"
      role="region"
      aria-label="Notifications"
      onMouseEnter={() => {
        hoveredRef.current = true;
        syncPause();
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        syncPause();
      }}
      onFocus={() => {
        focusedRef.current = true;
        syncPause();
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        focusedRef.current = false;
        syncPause();
      }}
    >
      <div role="alert" aria-atomic="false">
        {toasts.filter((toast) => toast.type === "error").map(renderToast)}
      </div>
      <div role="status" aria-atomic="false">
        {toasts.filter((toast) => toast.type !== "error").map(renderToast)}
      </div>
    </div>
  );
}
