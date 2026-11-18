import { User } from "lucide-react";
import { ProfileSettingsSkeleton } from "@/components/skeletons";

/** As `app/(en)/profile/loading.tsx`, with the heading in Czech. */
export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <User className="h-8 w-8 text-red-500" />
          <h1 className="text-3xl font-bold">Nastavení profilu</h1>
        </div>
        <p className="text-gray-400">Spravujte své předvolby a nastavení</p>
      </div>

      <ProfileSettingsSkeleton locale="cs" />
    </div>
  );
}
