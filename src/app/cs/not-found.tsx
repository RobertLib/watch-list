import type { Metadata } from "next";
import { NotFoundContent } from "@/components/NotFoundContent";

/** As `app/(en)/not-found.tsx`, for a `notFound()` inside the Czech tree. */
export const metadata: Metadata = {
  title: "Stránka nenalezena",
  description: "Tato stránka neexistuje. Na vašem seznamu se nic nezměnilo.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <NotFoundContent />;
}
