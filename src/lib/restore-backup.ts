import { COLLECTIONS_STORAGE_KEY, notifyCollectionsChanged } from "./collections";
import { DAILY_GAME_STORAGE_KEY, notifyGameStateChanged } from "./daily-game";
import { EPISODE_PROGRESS_STORAGE_KEY } from "./episode-progress";
import { GOAL_STORAGE_KEY, notifyGoalChanged } from "./goal";
import { HIGHER_LOWER_STORAGE_KEY } from "./higher-lower";
import { storesToSlot, type PortableData } from "./portable-data";
import {
  liveProfileChanges,
  notifyProfilesChanged,
  profileRestoreChanges,
} from "./profiles";
import { notifyRatingsChanged } from "./ratings";
import {
  HAS_SETTINGS_KEY,
  REGION_KEY,
  SELECTED_PROVIDERS_KEY,
  WATCH_PROVIDER_FILTER_KEY,
  refreshSettings,
} from "./settings";
import {
  applyStorageTransaction,
  type StorageTransactionResult,
} from "./storage-transaction";
import { providerIdsToStoredValue } from "./watch-provider-settings";
import { getProfileStorageOwner, isProfileDeleted, isProfileStorageOwnerAvailable, PROFILE_STORAGE_OWNER_KEY, withProfileStorage } from "./profile-storage";
import { withProfileRosterLock } from "./profile-roster-lock";

/** Restore every part of a backup before publishing any new store snapshot. */
export function restoreBackup(data: PortableData): Promise<StorageTransactionResult> {
  // Capture the rendered owner before waiting: withProfileStorage's synchronous
  // binding has ended by the time a different tab releases the roster lock.
  const owner = data.activeProfile?.id ?? getProfileStorageOwner();
  return withProfileRosterLock<StorageTransactionResult>(
    () => withProfileStorage(owner, () => restoreBackupLocked(data, owner)),
    { ok: false, key: "profiles", rolledBack: true },
  );
}

function restoreBackupLocked(data: PortableData, owner: string): StorageTransactionResult {
  let changes: Map<string, string | null>;
  let ownedKeys: string[];
  try {
    const stores = liveProfileChanges(storesToSlot(data), owner, {
      restoringProfile: data.activeProfile !== null,
    });
    ownedKeys = [...stores.keys()];
    changes = stores;
    if (data.activeProfile) {
      const profiles = profileRestoreChanges(
        data.activeProfile,
        data.otherProfiles.map((profile) => ({
          profile: { id: profile.id, name: profile.name },
          slot: storesToSlot(profile),
        })),
      );
      if (!profiles) return { ok: false, key: "profiles", rolledBack: true };
      changes = new Map([...profiles, ...stores]);
    }
  } catch (error) {
    console.error("Error preparing backup restore:", error);
    return { ok: false, key: "profiles", rolledBack: true };
  }

  const { region, watchProviderFilter, selectedProviderIds, hasCustomSettings } = data.settings;
  if (region !== null) changes.set(REGION_KEY, region);
  if (watchProviderFilter !== null) {
    changes.set(WATCH_PROVIDER_FILTER_KEY, watchProviderFilter);
  }
  if (selectedProviderIds !== null) {
    changes.set(SELECTED_PROVIDERS_KEY, providerIdsToStoredValue(selectedProviderIds));
  }
  const hasSettingValues = region !== null || watchProviderFilter !== null || selectedProviderIds !== null;
  const hasSettings = hasSettingValues || hasCustomSettings !== undefined;
  // Older backups inferred configuration from the settings they carried. New
  // exports also preserve whether those values were untouched browser defaults.
  if (hasSettings) changes.set(HAS_SETTINGS_KEY, String(hasCustomSettings ?? true));

  let result = applyStorageTransaction(changes, data.activeProfile ? {} : {
    validationKey: "profiles",
    validate: () => {
      if (!isProfileStorageOwnerAvailable(owner)) {
        throw new Error("This profile was removed while restoring");
      }
    },
  });
  if (!data.activeProfile && !result.ok) {
    try {
      // Rollback can put the old raw values back after another tab has deleted
      // their owner. The deletion marker remains authoritative; release those
      // orphaned stores rather than retaining a deleted person's old data.
      for (const key of ownedKeys) {
        if (!isProfileDeleted(owner)) break;
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.error("Error clearing a deleted profile after backup rollback:", error);
      result = { ok: false, key: result.key, rolledBack: false };
    }
  }
  if (!result.ok && result.rolledBack) return result;

  // The raw values were written without store setters, so no subscriber could
  // cache a partially imported map. A refused restore retains both raw storage
  // and the identities of the existing external-store snapshots.
  if (hasSettings || !result.ok) refreshSettings();
  notifyRatingsChanged();
  notifyCollectionsChanged();
  notifyGameStateChanged();
  notifyGoalChanged();
  if (data.activeProfile || !result.ok) notifyProfilesChanged();
  return result;
}

export function restoreFailureLabel(key: string | null): string {
  if (key?.startsWith("profile-store:")) key = key.slice(key.lastIndexOf(":") + 1);
  if (key?.startsWith("profile-data:") || key === "active-profile" || key === "profiles" || key === PROFILE_STORAGE_OWNER_KEY) {
    return "profiles";
  }
  if ([REGION_KEY, WATCH_PROVIDER_FILTER_KEY, SELECTED_PROVIDERS_KEY, HAS_SETTINGS_KEY].includes(key ?? "")) {
    return "settings";
  }
  const labels: Record<string, string> = {
    [EPISODE_PROGRESS_STORAGE_KEY]: "episodes",
    [COLLECTIONS_STORAGE_KEY]: "lists",
    [GOAL_STORAGE_KEY]: "goal",
    [DAILY_GAME_STORAGE_KEY]: "daily game",
    [HIGHER_LOWER_STORAGE_KEY]: "higher or lower",
  };
  if (key && labels[key]) return labels[key];
  return key ?? "backup";
}
