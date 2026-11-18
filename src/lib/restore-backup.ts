import { notifyCollectionsChanged } from "./collections";
import { notifyGameStateChanged } from "./daily-game";
import { notifyGoalChanged } from "./goal";
import { storeLabelForKey, storesToSlot, type PortableData, type ProfileRef } from "./portable-data";
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
import { DELETED_PROFILE_PREFIX, getLegacyProfileStorageOwner, getProfileStorageOwner, isProfileDeleted, isProfileStorageOwnerAvailable, PROFILE_STORAGE_OWNER_KEY, profileDisplayName, withProfileStorage } from "./profile-storage";
import { withProfileRosterLock } from "./profile-roster-lock";
import { t, type Locale } from "@/i18n/locale";

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

/**
 * The refused part of a restore, as the sentence "Could not restore …" needs it.
 *
 * Storage keys are addresses, not words: this used to hand the visitor
 * `profile-deleted:3f2a…` verbatim. `activeProfileId` is the profile the
 * restored stores belong to – "your" data – and `profiles` names the rest, from
 * the file and from the roster it replaces. An unknown key falls back to "this
 * backup" rather than ever showing an address.
 *
 * In Czech the phrase is in the accusative, as "Nepodařilo se obnovit …" needs
 * it – „tuto zálohu“. "Your" is left out there: Czech says „Nepodařilo se
 * obnovit hodnocení“ of the visitor's own, and a possessive would have to agree
 * with every label's gender and number.
 */
export function restoreFailureLabel(
  key: string | null,
  context: { activeProfileId?: string; profiles?: ProfileRef[] } = {},
  locale: Locale = "en",
): string {
  const nameOf = (profileId: string) => {
    const found = context.profiles?.find((profile) => profile.id === profileId);
    return found ? profileDisplayName(found, locale) : undefined;
  };
  const owned = (label: string, profileId: string | null) => {
    if (profileId !== null && profileId === context.activeProfileId) {
      return locale === "cs" ? label : `your ${label}`;
    }
    const name = profileId === null ? undefined : nameOf(profileId);
    if (locale === "cs") return name ? `${label} profilu „${name}“` : label;
    return name ? `${label} for "${name}"` : `the ${label}`;
  };
  const profile = (profileId: string, fallback: string) => {
    const name = nameOf(profileId);
    if (!name) return fallback;
    return locale === "cs" ? `profil „${name}“` : `the profile "${name}"`;
  };
  const thisBackup = t(locale, "this backup", "tuto zálohu");
  const profileList = t(locale, "the profile list", "seznam profilů");

  if (key === null) return thisBackup;
  if (key.startsWith(STORE_PREFIX)) {
    const separator = key.lastIndexOf(":");
    const label = storeLabelForKey(key.slice(separator + 1), locale);
    const profileId = decode(key.slice(STORE_PREFIX.length, separator));
    return label ? owned(label, profileId) : thisBackup;
  }
  if (key.startsWith(SLOT_PREFIX)) {
    return profile(
      key.slice(SLOT_PREFIX.length),
      t(locale, "a profile's older saved data", "starší uložená data jednoho z profilů"),
    );
  }
  if (key.startsWith(DELETED_PROFILE_PREFIX)) {
    return profile(decode(key.slice(DELETED_PROFILE_PREFIX.length)), profileList);
  }
  if (key === "active-profile" || key === "profiles" || key === PROFILE_STORAGE_OWNER_KEY) {
    return profileList;
  }
  if ([REGION_KEY, WATCH_PROVIDER_FILTER_KEY, SELECTED_PROVIDERS_KEY, HAS_SETTINGS_KEY].includes(key)) {
    return t(
      locale,
      "your region and platform settings",
      "nastavení regionu a streamovacích služeb",
    );
  }
  // A bare key is a store at the original owner's live address.
  const label = storeLabelForKey(key, locale);
  if (!label) return thisBackup;
  let owner: string | null = null;
  try {
    owner = getLegacyProfileStorageOwner();
  } catch {
    // The label still names the store; only its owner is unknown.
  }
  return owned(label, owner);
}

const STORE_PREFIX = "profile-store:";
const SLOT_PREFIX = "profile-data:";

function decode(component: string): string {
  try {
    return decodeURIComponent(component);
  } catch {
    return component;
  }
}
