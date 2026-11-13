import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ZipError, isZip, readZip } from "./zip";
import { buildZip } from "@/test/zip";

describe("readZip", () => {
  it("lists the files of an archive without reading them", () => {
    const entries = readZip(
      buildZip([
        { name: "watchlist.csv", content: "Date,Name\n" },
        { name: "lists/", content: "" },
        { name: "lists/favourites.csv", content: "Position,Name\n" },
      ]),
    );

    // The directory entry is not a file.
    expect(entries.map((entry) => entry.name)).toEqual(["watchlist.csv", "lists/favourites.csv"]);
    expect(entries[0].size).toBe("Date,Name\n".length);
  });

  it("reads a stored entry", async () => {
    const [entry] = readZip(buildZip([{ name: "a.csv", content: "Name\nHeat\n", stored: true }]));

    await expect(entry.text()).resolves.toBe("Name\nHeat\n");
  });

  it("inflates a deflated entry", async () => {
    const content = "Date,Name,Year\n".concat("2020-01-01,Heat,1995\n".repeat(500));
    const [entry] = readZip(buildZip([{ name: "watched.csv", content }]));

    await expect(entry.text()).resolves.toBe(content);
  });

  it("reads text as UTF-8, in names and in contents", async () => {
    const [entry] = readZip(buildZip([{ name: "série.csv", content: "Name\nAmélie – 千と千尋\n" }]));

    expect(entry.name).toBe("série.csv");
    await expect(entry.text()).resolves.toBe("Name\nAmélie – 千と千尋\n");
  });

  // The local header has an extra field of its own, usually longer than the
  // directory's. Reading the data from the directory's lengths lands inside it.
  it("finds the data after the local header's own extra field", async () => {
    const [entry] = readZip(
      buildZip([{ name: "a.csv", content: "Name\nHeat\n", localExtra: 28 }]),
    );

    await expect(entry.text()).resolves.toBe("Name\nHeat\n");
  });

  it("reads an archive that ends in a comment", async () => {
    const [entry] = readZip(
      buildZip([{ name: "a.csv", content: "Name\n" }], { comment: "exported by somebody" }),
    );

    await expect(entry.text()).resolves.toBe("Name\n");
  });

  it("refuses what is not an archive, by saying so", () => {
    const text = new TextEncoder().encode("Date,Name\n2020-01-01,Heat\n").buffer as ArrayBuffer;

    expect(() => readZip(text)).toThrow(ZipError);
    expect(() => readZip(text)).toThrow("not a ZIP archive");
  });

  it("refuses an entry compressed in a way it does not read", async () => {
    const [entry] = readZip(buildZip([{ name: "a.csv", content: "Name\n", method: 12 }]));

    await expect(entry.text()).rejects.toThrow("cannot read");
  });

  it("says an entry is damaged when its data does not inflate", async () => {
    const zip = new Uint8Array(buildZip([{ name: "a.csv", content: "Name\nHeat\n".repeat(200) }]));
    // Overwrite the start of the compressed data, just past the 30-byte local
    // header and the five-byte name.
    zip.fill(0xff, 35, 45);
    const [entry] = readZip(zip.buffer as ArrayBuffer);

    await expect(entry.text()).rejects.toThrow("could not be unpacked");
  });

  it("refuses an encrypted entry", async () => {
    const [entry] = readZip(buildZip([{ name: "a.csv", content: "Name\n", encrypted: true }]));

    await expect(entry.text()).rejects.toThrow("encrypted");
  });
});

describe("isZip", () => {
  it("tells an archive from a text file by its first bytes", () => {
    expect(isZip(buildZip([{ name: "a.csv", content: "x" }]))).toBe(true);
    expect(isZip(new TextEncoder().encode("Const,Title\n").buffer as ArrayBuffer)).toBe(false);
    expect(isZip(new ArrayBuffer(2))).toBe(false);
    // Sanity: the fixture builder really does deflate.
    expect(deflateRawSync(Buffer.from("aaaaaaaaaaaaaaaa")).length).toBeLessThan(16);
  });
});
