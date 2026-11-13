/**
 * Hand a piece of text – a game result – to whatever the device shares with.
 *
 * The system share sheet where there is one, the clipboard where there is not.
 * One function because the two games share the same four endings, and the
 * fourth is the one that is easy to get wrong: a share sheet the player
 * dismissed is an answer, not a failure. Falling through to the clipboard after
 * it sent a cancelled share on to a clipboard write that iOS refuses outside
 * the gesture – an error toast for having changed your mind.
 */

export type ShareOutcome =
  /** The share sheet took it. */
  | "shared"
  /** No share sheet, or it refused: the text is on the clipboard. */
  | "copied"
  /** The player closed the share sheet. Nothing to say. */
  | "dismissed"
  /** Neither worked – no clipboard outside a secure context, or it refused. */
  | "failed";

export async function shareText(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      if (
        error !== null && typeof error === "object" &&
        "name" in error && error.name === "AbortError"
      ) return "dismissed";
      // Refused or unsupported for text: the clipboard is still worth trying.
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
