import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { User } from "lucide-react";
import { ProfileSettings } from "@/components/ProfileSettings";
import { DataPortability } from "@/components/DataPortability";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";

/**
 * The Czech counterpart of `app/(en)/profile/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Profil",
  description:
    "Váš region, vaše streamovací služby a vaše uložená data – vše v tomto prohlížeči.",
  noindex: true,
  locale: "cs",
});

export default function ProfilePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <User className="h-8 w-8 text-red-500" />
          <h1 className="text-3xl font-bold">Nastavení profilu</h1>
        </div>
        <p className="text-gray-400">Spravujte své předvolby a nastavení</p>
      </div>

      <div className="space-y-6">
        <ProfileSwitcher />
        <ProfileSettings />
        <DataPortability />
      </div>
    </div>
  );
}
