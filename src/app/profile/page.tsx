import { User } from "lucide-react";
import type { Metadata } from "next";
import { ProfileContent } from "@/components/ProfileContent";

export const metadata: Metadata = {
  title: "Profile",
  description:
    "Manage your WatchList profile settings, preferences, and viewing history. Customize your movie and TV show discovery experience.",
  openGraph: {
    title: "Profile - WatchList",
    description:
      "Manage your WatchList profile settings, preferences, and viewing history. Customize your movie and TV show discovery experience.",
    type: "website",
    url: "https://www.watch-list.me/profile",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Profile - WatchList",
      },
    ],
  },
  alternates: {
    canonical: "https://www.watch-list.me/profile",
  },
};

export default function ProfilePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <User className="h-8 w-8 text-red-500" />
          <h1 className="text-3xl font-bold">Profile Settings</h1>
        </div>
        <p className="text-gray-400">Manage your preferences and settings</p>
      </div>

      <ProfileContent />
    </div>
  );
}
