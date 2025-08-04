"use client";

import { useEffect, useState } from "react";
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
    duration?: number
  ) => void;
}

let toastListeners: ((toast: Toast) => void)[] = [];

export const toast: ToastContextType = {
  showToast: (message: string, type = "info", duration = 3000) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = { id, message, type, duration };
    toastListeners.forEach((listener) => listener(newToast));
  },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const addToast = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);

      // Auto remove toast after duration
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, toast.duration);
    };

    toastListeners.push(addToast);

    return () => {
      toastListeners = toastListeners.filter(
        (listener) => listener !== addToast
      );
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

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
    <div
      className="fixed top-20 right-4 left-4 md:right-4 md:left-auto z-50 space-y-2 md:max-w-96"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm text-white w-full md:min-w-80 md:max-w-96 shadow-lg animate-in slide-in-from-right-full",
            getToastStyles(toast.type)
          )}
          role="alert"
          aria-live="assertive"
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
