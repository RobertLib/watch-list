"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "@/components/Toast";
import {
  createProfile,
  DEFAULT_PROFILE,
  deleteProfile,
  getActiveProfileId,
  getProfiles,
  MAX_PROFILE_NAME_LENGTH,
  MAX_PROFILES,
  renameProfile,
  switchProfile,
  type Profile,
} from "@/lib/profiles";
import { cn } from "@/lib/utils";

/**
 * Who is watching.
 *
 * Switching reloads the page on purpose: every context in the app read its store
 * once on mount, and quietly leaving them holding the previous person's watchlist
 * would be worse than the half-second.
 */
export function ProfileSwitcher() {
  const [profiles, setProfiles] = useState<Profile[]>([DEFAULT_PROFILE]);
  const [activeId, setActiveId] = useState(DEFAULT_PROFILE.id);
  const [newName, setNewName] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);

  // Which row is in edit mode, and what has been typed into it. One pair rather
  // than per-row state because only one row can be edited at a time.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrating from a
       browser-only store, which the server render cannot see */
    setProfiles(getProfiles());
    setActiveId(getActiveProfileId());
    setHasLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function select(profileId: string) {
    if (profileId === activeId) return;

    if (!switchProfile(profileId)) {
      toast.showToast("Could not switch profile", "error");
      return;
    }

    // A full reload rather than router navigation: the contexts hold the old
    // profile's data in memory and only read storage when they mount.
    window.location.reload();
  }

  function add(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = newName.trim();
    if (!trimmed) return;

    const created = createProfile(trimmed);
    if (!created) {
      // The two refusals worth naming. A generic "could not add" reads as a bug
      // when the real answer is "there is already a Tom".
      const isDuplicate = profiles.some(
        (profile) =>
          profile.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
      );

      toast.showToast(
        profiles.length >= MAX_PROFILES
          ? `One browser holds up to ${MAX_PROFILES} profiles`
          : isDuplicate
            ? `There is already a profile called "${trimmed}"`
            : "Could not add that profile",
        "error",
      );
      return;
    }

    setProfiles(getProfiles());
    setNewName("");
    toast.showToast(`Added "${created.name}" – switch to start their list`, "success");
  }

  function startRename(profile: Profile) {
    setRenamingId(profile.id);
    setDraft(profile.name);
  }

  function commitRename(event: React.FormEvent, profile: Profile) {
    event.preventDefault();

    const trimmed = draft.trim();
    // An unchanged name is a cancel, not a failure – it is what pressing Enter
    // straight after opening the field does.
    if (!trimmed || trimmed === profile.name) {
      setRenamingId(null);
      return;
    }

    if (!renameProfile(profile.id, trimmed)) {
      toast.showToast(
        profiles.some(
          (other) =>
            other.id !== profile.id &&
            other.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
        )
          ? `There is already a profile called "${trimmed}"`
          : "Could not rename that profile",
        "error",
      );
      return;
    }

    setProfiles(getProfiles());
    setRenamingId(null);
  }

  function remove(profile: Profile) {
    if (!deleteProfile(profile.id)) {
      toast.showToast("Switch to another profile first", "error");
      return;
    }

    setProfiles(getProfiles());
    toast.showToast(`Deleted "${profile.name}"`, "success");
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
          Who is watching
        </h2>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">
          One browser, separate watchlists. Everything personal – saved titles,
          episode ticks, ratings, lists, puzzle streak – belongs to whoever is
          active. Region and platform settings are shared.
        </p>
      </div>

      <ul className="space-y-2">
        {profiles.map((profile) => {
          const isActive = hasLoaded && profile.id === activeId;
          const isRenaming = renamingId === profile.id;

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
                      maxLength={MAX_PROFILE_NAME_LENGTH}
                      onChange={(event) => setDraft(event.target.value)}
                      aria-label={`Rename ${profile.name}`}
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-black/60 border border-gray-700 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="text-sm text-gray-500 hover:text-white transition-colors"
                    >
                      Cancel
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
                        {profile.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="text-white">{profile.name}</span>
                      {isActive && (
                        <span className="flex items-center gap-1 text-xs text-blue-300">
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          active
                        </span>
                      )}
                    </button>

                    {/* Every profile, the default one included: "Me" is a
                        placeholder, and it is the row most people want to put
                        their own name on. */}
                    <button
                      onClick={() => startRename(profile)}
                      aria-label={`Rename ${profile.name}`}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </button>

                    {profile.id !== DEFAULT_PROFILE.id && !isActive && (
                      <button
                        onClick={() => remove(profile)}
                        aria-label={`Delete ${profile.name} and their data`}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-300 hover:bg-white/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
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
            New profile name
          </label>
          <input
            id="new-profile"
            value={newName}
            maxLength={MAX_PROFILE_NAME_LENGTH}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Add someone…"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/60 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add
          </button>
        </form>
      )}

      <p className="text-xs text-gray-500 leading-relaxed">
        Switching swaps what this browser holds, so keep one profile open at a
        time – two tabs on two profiles will overwrite each other. The backup on
        this page covers the active profile only.
      </p>
    </section>
  );
}
