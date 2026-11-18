"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "@/components/Toast";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useWatched } from "@/contexts/WatchedContext";
import { useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import {
  createProfile,
  DEFAULT_PROFILE,
  deleteProfile,
  getActiveProfileId,
  getProfiles,
  MAX_PROFILE_NAME_LENGTH,
  MAX_PROFILES,
  profileDisplayName,
  renameProfile,
  subscribeProfiles,
  switchProfileWithResult,
  type Profile,
} from "@/lib/profiles";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { formatCount, type PluralForms } from "@/i18n/format";

const PROFILES = {
  en: ["profile", "profiles"],
  cs: ["profil", "profily", "profilů"],
} satisfies PluralForms;

/**
 * Who is watching.
 *
 * Switching reloads the page on purpose: every context in the app read its store
 * once on mount, and quietly leaving them holding the previous person's watchlist
 * would be worse than the half-second.
 */
export function ProfileSwitcher() {
  const { refreshWatchlist } = useWatchlist();
  const { refreshWatched } = useWatched();
  const { refreshProgress } = useEpisodeProgress();
  const [profiles, setProfiles] = useState<Profile[]>([DEFAULT_PROFILE]);
  const [activeId, setActiveId] = useState(DEFAULT_PROFILE.id);
  const [newName, setNewName] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const locale = useLocale();
  const t = useT();
  const shownName = (profile: Profile) => profileDisplayName(profile, locale);

  /**
   * Whether `name` is taken only on screen: another profile is still stored
   * under a placeholder ("Me") that this page shows translated ("Já"). The
   * roster's own check compares stored names and would let a second "Já"
   * in beside it. In English what is shown is what is stored, so this never
   * answers yes there. Checked against the roster on screen: it is the one
   * whose names the visitor is reading.
   */
  const isShownNameTaken = (name: string, exceptId?: string) =>
    profiles.some((profile) => {
      const shown = shownName(profile);
      return (
        profile.id !== exceptId &&
        shown !== profile.name &&
        shown.toLocaleLowerCase() === name.toLocaleLowerCase()
      );
    });

  // Which row is in edit mode, and what has been typed into it. One pair rather
  // than per-row state because only one row can be edited at a time.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Which row is asking "really?". Deleting a profile takes their watchlist,
  // ratings and ticks with it and there is no undo, so the bin icon only opens
  // this – the same inline step the lists page and the ranking use.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const refreshProfiles = () => {
      setProfiles(getProfiles());
      setActiveId(getActiveProfileId());
      setHasLoaded(true);
    };
    refreshProfiles();
    return subscribeProfiles(refreshProfiles);
  }, []);

  async function select(profileId: string) {
    if (requiresReload || saving.current || profileId === activeId) return;

    saving.current = true;
    setIsSaving(true);
    try {
      const result = await switchProfileWithResult(profileId);
      if (!result.ok) {
        if (!result.rolledBack) {
          // Storage adopted a different owner before the switch failed. Read
          // that owner's data before offering a reload to finish recovery.
          refreshWatchlist();
          refreshWatched();
          refreshProgress();
          setRequiresReload(true);
          return;
        }
        toast.showToast(t("Could not switch profile", "Profil se nepodařilo přepnout"), "error");
        return;
      }

      // A full reload rather than router navigation: the contexts hold the old
      // profile's data in memory and only read storage when they mount. That
      // includes a profile another tab had already switched to before this
      // tab heard about it – the switch succeeds, and this page catches up.
      window.location.reload();
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (requiresReload || saving.current) return;

    const trimmed = newName.trim();
    if (!trimmed) return;

    if (isShownNameTaken(trimmed)) {
      toast.showToast(duplicateMessage(trimmed), "error");
      return;
    }

    saving.current = true;
    setIsSaving(true);
    try {
      const created = await createProfile(trimmed);
      if (!created) {
        // The two refusals worth naming. A generic "could not add" reads as a bug
        // when the real answer is "there is already a Tom".
        const currentProfiles = getProfiles();
        const isDuplicate = currentProfiles.some(
          (profile) =>
            profile.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
        );

        toast.showToast(
          currentProfiles.length >= MAX_PROFILES
            ? t(
                `One browser holds up to ${MAX_PROFILES} profiles`,
                `Jeden prohlížeč pojme nejvýš ${formatCount(MAX_PROFILES, locale, PROFILES)}`,
              )
            : isDuplicate
              ? duplicateMessage(trimmed)
              : t("Could not add that profile", "Profil se nepodařilo přidat"),
          "error",
        );
        return;
      }

      setProfiles(getProfiles());
      setNewName("");
      toast.showToast(
        t(
          `Added "${created.name}" – switch to start their list`,
          `Profil „${shownName(created)}“ je přidaný – přepněte na něj a začněte jeho seznam`,
        ),
        "success",
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  function startRename(profile: Profile) {
    if (requiresReload || saving.current) return;
    setRenamingId(profile.id);
    setDraft(shownName(profile));
  }

  function duplicateMessage(name: string): string {
    return t(
      `There is already a profile called "${name}"`,
      `Profil „${name}“ už existuje`,
    );
  }

  async function commitRename(event: React.FormEvent, profile: Profile) {
    event.preventDefault();
    if (requiresReload || saving.current) return;

    const trimmed = draft.trim();
    // An unchanged name is a cancel, not a failure – it is what pressing Enter
    // straight after opening the field does. The field opens on the name as
    // shown, which for a placeholder is not the stored one.
    if (!trimmed || trimmed === profile.name || trimmed === shownName(profile)) {
      setRenamingId(null);
      return;
    }

    if (isShownNameTaken(trimmed, profile.id)) {
      toast.showToast(duplicateMessage(trimmed), "error");
      return;
    }

    saving.current = true;
    setIsSaving(true);
    try {
      if (!(await renameProfile(profile.id, trimmed))) {
        toast.showToast(
          getProfiles().some(
            (other) =>
              other.id !== profile.id &&
              other.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
          )
            ? duplicateMessage(trimmed)
            : t("Could not rename that profile", "Profil se nepodařilo přejmenovat"),
          "error",
        );
        return;
      }

      setProfiles(getProfiles());
      setRenamingId(null);
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  async function remove(profile: Profile) {
    if (requiresReload || saving.current) return;
    setConfirmingDeleteId(null);

    saving.current = true;
    setIsSaving(true);
    try {
      if (!(await deleteProfile(profile.id))) {
        // The button is only rendered for a profile that is neither the default
        // nor the active one, so the usual refusal is the browser declining the
        // write – out of quota, or a private window storing nothing. Naming the
        // wrong one sends the visitor off to switch profiles for no reason.
        toast.showToast(
          profile.id === activeId
            ? t("Switch to another profile first", "Nejdřív přepněte na jiný profil")
            : t(
                `Could not delete "${profile.name}" – this browser refused to save the change`,
                `Profil „${shownName(profile)}“ se nepodařilo smazat – prohlížeč odmítl změnu uložit`,
              ),
          "error",
        );
        return;
      }

      setProfiles(getProfiles());
      toast.showToast(
        t(`Deleted "${profile.name}"`, `Profil „${shownName(profile)}“ je smazaný`),
        "success",
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="profiles-heading"
      className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4"
    >
      <div>
        <h2
          id="profiles-heading"
          className="text-lg font-semibold text-white flex items-center gap-2"
        >
          <Users className="w-5 h-5 text-blue-400" aria-hidden="true" />
          {t("Who is watching", "Kdo se dívá")}
        </h2>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">
          {t(
            "One browser, separate watchlists. Everything personal – saved titles, episode ticks, ratings, lists, puzzle streak – belongs to whoever is active. Region and platform settings are shared.",
            "Jeden prohlížeč, oddělené seznamy. Vše osobní – uložené tituly, odškrtnuté epizody, hodnocení, vlastní seznamy, série v hádankách – patří tomu, kdo je právě aktivní. Nastavení regionu a streamovacích služeb je společné.",
          )}
        </p>
      </div>

      {requiresReload && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 space-y-3">
          <p className="font-semibold text-red-200">
            {t("Profile switch failed", "Přepnutí profilu se nezdařilo")}
          </p>
          <p className="text-sm text-red-100/80 leading-relaxed">
            {t(
              "The active profile changed before the switch could finish. Reload to read the currently saved profile before switching again.",
              "Aktivní profil se změnil dřív, než se přepnutí stihlo dokončit. Než přepnete znovu, načtěte stránku, ať se načte aktuálně uložený profil.",
            )}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            {t("Reload saved data", "Znovu načíst uložená data")}
          </button>
        </div>
      )}

      {/* A pending save marks the controls aria-disabled rather than disabling
          the fieldset: native `disabled` blurred the button or field just used,
          and keyboard focus fell to the top of the page. The `saving` guard in
          every handler refuses a second action meanwhile, and the text fields
          go read-only so nothing typed is lost when a save resets them. Only
          a failed switch that needs a reload disables them outright. */}
      <fieldset
        disabled={requiresReload}
        aria-disabled={isSaving || undefined}
        aria-busy={isSaving}
        className="space-y-4 disabled:opacity-60 aria-disabled:opacity-60"
      >
        <legend className="sr-only">{t("Profile controls", "Správa profilů")}</legend>
        <ul className="space-y-2">
          {profiles.map((profile) => {
            const isActive = hasLoaded && profile.id === activeId;
            const isRenaming = renamingId === profile.id;
            const name = shownName(profile);

            return (
              <li key={profile.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                    isActive
                      ? "border-blue-500/50 bg-blue-500/10"
                      : "border-gray-800 bg-black/30",
                  )}
                >
                  {isRenaming ? (
                    <form
                      onSubmit={(event) => commitRename(event, profile)}
                      className="flex-1 flex items-center gap-2"
                    >
                      <input
                        autoFocus
                        value={draft}
                        readOnly={isSaving}
                        maxLength={MAX_PROFILE_NAME_LENGTH}
                        onChange={(event) => setDraft(event.target.value)}
                        aria-label={t(`Rename ${profile.name}`, `Přejmenovat profil „${name}“`)}
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-black/60 border border-gray-700 text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="submit"
                        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {t("Save", "Uložit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="text-sm text-gray-500 hover:text-white transition-colors"
                      >
                        {t("Cancel", "Zrušit")}
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        onClick={() => select(profile.id)}
                        disabled={isActive}
                        className="flex-1 flex items-center gap-2.5 text-left disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            isActive
                              ? "bg-blue-600 text-white"
                              : "bg-gray-800 text-gray-400",
                          )}
                          aria-hidden="true"
                        >
                          {name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="text-white">{name}</span>
                        {isActive && (
                          <span className="flex items-center gap-1 text-xs text-blue-300">
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            {t("active", "aktivní")}
                          </span>
                        )}
                      </button>

                      {/* Every profile, the default one included: "Me" is a
                          placeholder, and it is the row most people want to put
                          their own name on. */}
                      <button
                        onClick={() => startRename(profile)}
                        aria-label={t(`Rename ${profile.name}`, `Přejmenovat profil „${name}“`)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Pencil className="w-4 h-4" aria-hidden="true" />
                      </button>

                      {profile.id !== DEFAULT_PROFILE.id &&
                        !isActive &&
                        (confirmingDeleteId === profile.id ? (
                          <span className="flex items-center gap-2 text-sm">
                            <button
                              onClick={() => remove(profile)}
                              aria-label={t(
                                `Yes, delete ${profile.name} and their data`,
                                `Ano, smazat profil „${name}“ i s jeho daty`,
                              )}
                              className="text-red-400 hover:text-red-300 transition-colors"
                            >
                              {t("Delete", "Smazat")}
                            </button>
                            <button
                              onClick={() => setConfirmingDeleteId(null)}
                              className="text-gray-500 hover:text-white transition-colors"
                            >
                              {t("Cancel", "Zrušit")}
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmingDeleteId(profile.id)}
                            aria-label={t(
                              `Delete ${profile.name} and their data`,
                              `Smazat profil „${name}“ i s jeho daty`,
                            )}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-red-300 hover:bg-white/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        ))}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {profiles.length < MAX_PROFILES && (
          <form onSubmit={add} className="flex gap-2">
            <label htmlFor="new-profile" className="sr-only">
              {t("New profile name", "Jméno nového profilu")}
            </label>
            <input
              id="new-profile"
              value={newName}
              readOnly={isSaving}
              maxLength={MAX_PROFILE_NAME_LENGTH}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t("Add someone…", "Přidat někoho…")}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/60 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t("Add", "Přidat")}
            </button>
          </form>
        )}
      </fieldset>

      <p className="text-xs text-gray-500 leading-relaxed">
        {t(
          "Each profile keeps its own lists, ratings and progress. Switching profiles updates every open tab in this browser. The backup on this page covers every profile.",
          "Každý profil má vlastní seznamy, hodnocení a rozkoukané seriály. Přepnutí profilu se projeví ve všech otevřených kartách tohoto prohlížeče. Záloha na této stránce zahrnuje všechny profily.",
        )}
      </p>
    </section>
  );
}
