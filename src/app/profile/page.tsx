import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { User } from "lucide-react";
import { ProfileSettings } from "@/components/ProfileSettings";
import { DataPortability } from "@/components/DataPortability";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";

export const metadata: Metadata = pageMetadata({
  title: "Profile",
  description:
    "Your region, your streaming services and your saved data, all kept in this browser.",
  noindex: true,
});

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

      <div className="space-y-6">
        <ProfileSwitcher />
        <ProfileSettings />
        <DataPortability />
      </div>
    </div>
  );
}
