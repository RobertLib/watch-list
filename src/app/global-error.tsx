"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Something went wrong!</h2>
            <p className="text-gray-400 text-lg mb-4">
              A critical error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-md transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
