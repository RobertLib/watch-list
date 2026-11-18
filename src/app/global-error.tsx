"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { localeFromPathname, t } from "@/i18n/locale";
// This replaces the root layout when it renders, so it never inherits the
// stylesheet that layout.tsx imports and has to pull it in itself – without
// this the fallback shows up completely unstyled.
import "./globals.css";

/**
 * `retry` rather than `reset`, for the reason given in `error.tsx`.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global application error:", error);
  }, [error]);

  // Outside both root layouts, so outside their locale too: the address says
  // which tree failed. Only ever rendered in the browser, after an error.
  const locale =
    typeof window === "undefined"
      ? "en"
      : localeFromPathname(window.location.pathname);

  return (
    // `lang` for the same reason the root layout carries one: this file replaces
    // that layout wholesale rather than nesting inside it, so anything it does
    // not state itself is simply absent. A document with no language leaves a
    // screen reader to guess a pronunciation, and the guess is usually the
    // reader's own locale rather than the page's.
    <html lang={locale}>
      <body>
        {/* An error boundary is a Client Component, so `metadata` is not
            available here – React's own <title> is what names the tab instead.
            Without it the tab keeps whatever title the page had before it
            failed, which reads as though nothing went wrong. */}
        <title>
          {t(locale, "Something went wrong – WatchList", "Něco se pokazilo – WatchList")}
        </title>
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">
              {t(locale, "Something went wrong!", "Něco se pokazilo.")}
            </h2>
            <p className="text-gray-400 text-lg mb-4">
              {t(
                locale,
                "A critical error occurred. Please try again.",
                "Došlo k závažné chybě. Zkuste to prosím znovu.",
              )}
            </p>
            <button
              onClick={() => retry()}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-md transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {t(locale, "Try Again", "Zkusit znovu")}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
