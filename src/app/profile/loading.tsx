import { User } from "lucide-react";
import { ProfileSettingsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <User className="h-8 w-8 text-red-500" />
          <h1 className="text-3xl font-bold">Profile Settings</h1>
        </div>
        <p className="text-gray-400">Manage your preferences and settings</p>
      </div>

      <ProfileSettingsSkeleton />
    </div>
  );
}
