import { describe, expect, it } from "vitest";
import { cn, createSlug, extractIdFromSlug } from "./utils";

describe("createSlug", () => {
  it("lowercases and dash-joins a title", () => {
    expect(createSlug("The Dark Knight", 155)).toBe("the-dark-knight-155");
  });

  it("strips punctuation rather than encoding it", () => {
    expect(createSlug("Amélie: A Story?!", 194)).toBe("amelie-a-story-194");
    expect(createSlug("Star Wars (1977)", 11)).toBe("star-wars-1977-11");
  });

  // Dropping every non-ASCII character took the accented letters with it:
  // "amlie", "dn". The accent is what should go, not the letter under it.
  it("transliterates accented Latin instead of dropping the letters", () => {
    expect(createSlug("Amélie", 194)).toBe("amelie-194");
    expect(createSlug("Ödön", 129)).toBe("odon-129");
    expect(createSlug("Les Misérables", 82695)).toBe("les-miserables-82695");
    expect(createSlug("Pokémon: Mewtwo Strikes Back", 10228)).toBe(
      "pokemon-mewtwo-strikes-back-10228",
    );
  });

  it("spells out the Latin letters Unicode does not decompose", () => {
    expect(createSlug("Ødegaard", 1)).toBe("odegaard-1");
    expect(createSlug("Łódź", 2)).toBe("lodz-2");
    expect(createSlug("Straße", 3)).toBe("strasse-3");
    expect(createSlug("Æon Flux", 4)).toBe("aeon-flux-4");
  });

  // Every slug already handed out for an ASCII title has to stay what it was:
  // they are in shares, bookmarks and search indexes. Checked against the
  // previous implementation over every printable ASCII character.
  it("leaves the slug of an ASCII title exactly as it was", () => {
    const previous = (title: string, id: number) =>
      `${title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim()
        .replace(/^-+|-+$/g, "")}-${id}`;
    const printable = Array.from({ length: 95 }, (_, i) =>
      String.fromCharCode(32 + i),
    );
    const titles = [
      "The Dark Knight",
      "Star Wars: Episode IV - A New Hope",
      "2001: A Space Odyssey",
      "Mission: Impossible -- Dead Reckoning",
      "  Se7en\t(1995)  ",
      ...printable.map((char) => `A${char}B`),
    ];

    for (const title of titles) {
      expect(createSlug(title, 550), JSON.stringify(title)).toBe(
        previous(title, 550),
      );
    }
  });

  it("collapses runs of whitespace and dashes into one dash", () => {
    expect(createSlug("Mad   Max --- Fury Road", 76341)).toBe(
      "mad-max-fury-road-76341",
    );
  });

  it("leaves no leading or trailing dash", () => {
    expect(createSlug("  ...Spirited Away...  ", 129)).toBe(
      "spirited-away-129",
    );
  });

  // A title in a non-Latin script loses every character, and the id is all the
  // detail pages actually need to resolve the URL. It used to come out as
  // "-129", which reads as a negative id.
  it("falls back to the bare id when nothing survives", () => {
    expect(createSlug("千と千尋の神隠し", 129)).toBe("129");
    expect(createSlug("Брат", 20992)).toBe("20992");
    expect(createSlug("?!", 7)).toBe("7");
  });

  it("keeps the Latin part of a title that mixes scripts", () => {
    expect(createSlug("Pokémon: ミュウツーの逆襲", 10228)).toBe("pokemon-10228");
  });

  it("handles a missing title without throwing", () => {
    expect(createSlug("", 42)).toBe("item-42");
    expect(createSlug(undefined as unknown as string, 42)).toBe("item-42");
    expect(createSlug(null as unknown as string, 42)).toBe("item-42");
  });
});

describe("extractIdFromSlug", () => {
  it("reads a bare numeric slug", () => {
    expect(extractIdFromSlug("1405")).toBe(1405);
  });

  it("reads the id off the end", () => {
    expect(extractIdFromSlug("dexter-1405")).toBe(1405);
    expect(extractIdFromSlug("the-dark-knight-155")).toBe(155);
  });

  it("reads the id off the front", () => {
    expect(extractIdFromSlug("1405-dexter")).toBe(1405);
  });

  it("prefers the trailing id when both ends carry a number", () => {
    expect(extractIdFromSlug("2012-movie-1234")).toBe(1234);
  });

  // Why the trailing id wins: a title that begins with a number is common, and
  // every slug below is one this app has handed out. An id-first slug whose
  // title ends in a number ("1367-rocky-2") is indistinguishable from these and
  // only arrives by hand, so it reads as the trailing id.
  it("reads the id this app emits even when the title begins with a number", () => {
    expect(extractIdFromSlug(createSlug("28 Days Later", 170))).toBe(170);
    expect(extractIdFromSlug(createSlug("2001: A Space Odyssey", 62))).toBe(62);
    expect(extractIdFromSlug(createSlug("1917", 530915))).toBe(530915);
  });

  it("falls back to the front when the end cannot be an id", () => {
    expect(extractIdFromSlug("1367-rocky-0")).toBe(1367);
    expect(extractIdFromSlug(`1367-rocky-${"9".repeat(20)}`)).toBe(1367);
  });

  it("returns null when there is no id to find", () => {
    expect(extractIdFromSlug("dexter")).toBeNull();
    expect(extractIdFromSlug("")).toBeNull();
    expect(extractIdFromSlug("-")).toBeNull();
  });

  // 309 digits parse to Infinity and 17 to a neighbouring integer. Either used to
  // reach the TMDB client, which threw on it – and the page reported TMDB as
  // unreachable, with a "try again" that could never succeed, instead of saying
  // the title does not exist.
  it("returns null for an id that is not a safe integer", () => {
    const huge = "9".repeat(309);
    expect(extractIdFromSlug(huge)).toBeNull();
    expect(extractIdFromSlug(`fight-club-${huge}`)).toBeNull();
    expect(extractIdFromSlug(`${huge}-fight-club`)).toBeNull();
    expect(extractIdFromSlug("12345678901234567")).toBeNull();
    expect(extractIdFromSlug(String(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("returns null for an id of zero", () => {
    expect(extractIdFromSlug("0")).toBeNull();
    expect(extractIdFromSlug("fight-club-0")).toBeNull();
  });

  // `createSlug` built "-129" for every title with no Latin letters until the
  // bare-id fallback replaced it, and those links are still in circulation.
  it("still resolves the dash-prefixed slugs createSlug used to build", () => {
    expect(extractIdFromSlug("-129")).toBe(129);
  });

  it("round-trips whatever createSlug produced", () => {
    for (const [title, id] of [
      ["The Dark Knight", 155],
      ["Amélie: A Story?!", 194],
      ["千と千尋の神隠し", 129],
      ["Ødegaard", 7],
      ["", 42],
    ] as const) {
      expect(extractIdFromSlug(createSlug(title, id))).toBe(id);
    }
  });
});

describe("cn", () => {
  it("joins truthy class names and drops the rest", () => {
    expect(cn("a", false, undefined, null, "b", 0)).toBe("a b");
  });

  it("flattens nested arrays", () => {
    expect(cn("a", ["b", ["c", false]])).toBe("a b c");
  });

  it("returns an empty string when nothing applies", () => {
    expect(cn(false, undefined)).toBe("");
  });
});
