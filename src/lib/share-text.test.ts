import { afterEach, describe, expect, it, vi } from "vitest";
import { shareText } from "./share-text";

function stubNavigator(value: {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}) {
  vi.stubGlobal("navigator", value);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shareText", () => {
  it("uses the share sheet where there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    stubNavigator({ share, clipboard: { writeText } });

    await expect(shareText("result")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "result" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies where there is no share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } });

    await expect(shareText("result")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("result");
  });

  // Changing your mind is not an error, and iOS refuses a clipboard write made
  // after the sheet closes – so a dismissal must not reach the clipboard.
  it("treats a dismissed share sheet as an answer, not a failure", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const writeText = vi.fn();
    stubNavigator({ share, clipboard: { writeText } });

    await expect(shareText("result")).resolves.toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when the share sheet refuses", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("refused", "NotAllowedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });

    await expect(shareText("result")).resolves.toBe("copied");
  });

  it("reports a failure when there is no clipboard either", async () => {
    stubNavigator({});

    await expect(shareText("result")).resolves.toBe("failed");
  });
});
