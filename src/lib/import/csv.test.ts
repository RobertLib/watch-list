import { describe, expect, it } from "vitest";
import { field, hasColumn, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("reads rows by header name", () => {
    const { headers, rows } = parseCsv("Date,Name,Year\n2023-09-26,Sanctuary,2022\n");

    expect(headers).toEqual(["Date", "Name", "Year"]);
    expect(rows).toEqual([{ Date: "2023-09-26", Name: "Sanctuary", Year: "2022" }]);
  });

  // IMDb and Letterboxd both quote a title that has a comma in it.
  it("keeps a comma inside a quoted field", () => {
    const { rows } = parseCsv(
      'Date,Name,Year\n2018-01-27,"Three Billboards Outside Ebbing, Missouri",2017\n',
    );

    expect(rows[0].Name).toBe("Three Billboards Outside Ebbing, Missouri");
  });

  it("reads a doubled quote as a quote", () => {
    const { rows } = parseCsv('Name,Year\n"The ""Burbs",1989\n');

    expect(rows[0].Name).toBe('The "Burbs');
  });

  // A Letterboxd review is one field with paragraphs in it.
  it("keeps line breaks inside a quoted field", () => {
    const { rows } = parseCsv('Name,Review,Year\nHeat,"First line.\nSecond, line.",1995\nRonin,,1998\n');

    expect(rows).toHaveLength(2);
    expect(rows[0].Review).toBe("First line.\nSecond, line.");
    expect(rows[1]).toEqual({ Name: "Ronin", Review: "", Year: "1998" });
  });

  it("reads Windows and old Mac line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n3,4").rows).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }]);
    expect(parseCsv("a,b\r1,2\r").rows).toEqual([{ a: "1", b: "2" }]);
  });

  // A file opened and saved in a spreadsheet comes back with both.
  it("strips a byte-order mark and reads semicolons where there are no commas", () => {
    const { headers, rows } = parseCsv("﻿Const;Your Rating\ntt0113277;9\n");

    expect(headers).toEqual(["Const", "Your Rating"]);
    expect(rows).toEqual([{ Const: "tt0113277", "Your Rating": "9" }]);
  });

  it("skips blank lines but keeps a row of empty fields", () => {
    const { rows } = parseCsv("a,b\n\n1,2\n,\n\n");

    expect(rows).toEqual([{ a: "1", b: "2" }, { a: "", b: "" }]);
  });

  it("fills a short row with empty values rather than misaligning it", () => {
    expect(parseCsv("a,b,c\n1,2\n").rows).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("reads a very long field", () => {
    const long = "x".repeat(50_000);
    expect(parseCsv(`a,b\n"${long}",1\n`).rows[0].a).toHaveLength(50_000);
  });

  it("answers nothing for an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("field", () => {
  const row = { Const: "tt1", "Your Rating": "", s_no: "2", season_number: "9" };

  it("takes the first name that is filled", () => {
    expect(field(row, "s_no", "season_number")).toBe("2");
    expect(field(row, "Your Rating", "You rated")).toBe("");
  });

  // IMDb's legacy export wrote `const`; the current one writes `Const`.
  it("matches a header whatever its case", () => {
    expect(field(row, "const")).toBe("tt1");
  });
});

describe("hasColumn", () => {
  it("looks a column up whatever its case", () => {
    expect(hasColumn(["Const", "Title"], "const")).toBe(true);
    expect(hasColumn(["Const", "Title"], "Position", "Created")).toBe(false);
  });
});
