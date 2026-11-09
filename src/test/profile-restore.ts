import * as profiles from "@/lib/profiles";
import type { Profile } from "@/lib/profiles";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";
import { applyStorageTransaction } from "@/lib/storage-transaction";

type RosterRestorer = Pick<typeof profiles, "notifyProfilesChanged" | "profileRestoreChanges">;

/**
 * Commit only the roster half of a restore – `profileRestoreChanges` under the
 * shared lock, in one storage transaction – the way `restoreBackup` commits it
 * beside the active profile's stores. Tests use raw slot strings with it, which
 * a backup's sanitizers would rebuild. Pass another module instance to act as
 * an independent tab.
 */
export function restoreProfileRoster(
  active: Profile | null,
  others: { profile: Profile; slot: Record<string, string> }[],
  module: RosterRestorer = profiles,
): Promise<boolean> {
  return withProfileRosterLock(() => {
    try {
      const changes = module.profileRestoreChanges(active, others);
      if (!changes || !applyStorageTransaction(changes).ok) return false;
    } catch (error) {
      console.error("Error preparing profile restore:", error);
      return false;
    }

    module.notifyProfilesChanged();
    return true;
  }, false);
}
