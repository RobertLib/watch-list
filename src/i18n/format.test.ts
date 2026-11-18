import { describe, expect, it } from "vitest";
import { formatCount, formatList, formatNumber, pluralForm } from "./format";

const FILMS = { en: ["film", "films"], cs: ["film", "filmy", "filmů"] } as const satisfies {
  en: [string, string];
  cs: [string, string, string];
};

describe("pluralForm", () => {
  it("takes English's two forms", () => {
    expect(pluralForm(1, "en", FILMS)).toBe("film");
    expect(pluralForm(0, "en", FILMS)).toBe("films");
    expect(pluralForm(2, "en", FILMS)).toBe("films");
  });

  it("takes Czech's three: one, two to four, and the rest", () => {
    expect(pluralForm(1, "cs", FILMS)).toBe("film");
    expect(pluralForm(2, "cs", FILMS)).toBe("filmy");
    expect(pluralForm(4, "cs", FILMS)).toBe("filmy");
    expect(pluralForm(5, "cs", FILMS)).toBe("filmů");
    expect(pluralForm(0, "cs", FILMS)).toBe("filmů");
    // Not by the last digit, the way Polish or Russian would: 22 is "filmů".
    expect(pluralForm(22, "cs", FILMS)).toBe("filmů");
    expect(pluralForm(1.5, "cs", FILMS)).toBe("filmy");
  });
});

describe("formatCount", () => {
  it("formats the number in the language's own way", () => {
    expect(formatCount(1234, "en", FILMS)).toBe("1,234 films");
    // Czech groups thousands with a (non-breaking) space.
    expect(formatCount(1234, "cs", FILMS)).toMatch(/^1\s234 filmů$/u);
    expect(formatNumber(3, "cs")).toBe("3");
  });
});

describe("formatList", () => {
  it("joins with the serial comma in English and without it in Czech", () => {
    expect(formatList(["a", "b", "c"], "en")).toBe("a, b, and c");
    expect(formatList(["a", "b", "c"], "cs")).toBe("a, b a c");
    expect(formatList(["a", "b"], "cs")).toBe("a a b");
    expect(formatList(["a"], "cs")).toBe("a");
    expect(formatList([], "en")).toBe("");
  });
});
