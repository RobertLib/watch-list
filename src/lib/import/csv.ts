/**
 * A CSV reader for other services' exports.
 *
 * Written rather than borrowed because the job is small and the inputs are
 * awkward in ways a `split(",")` is wrong about: Letterboxd puts whole reviews
 * – newlines, HTML, commas – inside one quoted field; IMDb quotes titles that
 * contain commas; TV Time writes a field several kilobytes long. And the same
 * file comes back from a spreadsheet with a byte-order mark and semicolons. So:
 * RFC 4180 quoting (a doubled quote is a quote, a quoted field may span lines),
 * any of the three line endings, a BOM stripped, and the delimiter read off the
 * header line.
 *
 * Rows are returned keyed by header name, never by position – TV Time's own
 * exports order their columns differently from one account to the next.
 */

export type CsvRow = Record<string, string>;

export interface ParsedCsv {
  /** As written in the file, trimmed. */
  headers: string[];
  rows: CsvRow[];
}

/** Split CSV text into records of fields. */
function records(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  /** Whether the current field has any content or quotes – tells a blank line from an empty field. */
  let touched = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
      touched = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
      touched = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      // A line with nothing on it is a separator, not a record of one empty field.
      if (touched || field !== "" || record.length > 0) {
        record.push(field);
        out.push(record);
      }
      record = [];
      field = "";
      touched = false;
    } else {
      field += char;
    }
  }

  if (touched || field !== "" || record.length > 0) {
    record.push(field);
    out.push(record);
  }
  return out;
}

/**
 * The delimiter a header line was written with. A comma unless the line has
 * none and does have semicolons or tabs – what a spreadsheet in a locale that
 * writes decimals with a comma saves a CSV as.
 */
function sniffDelimiter(headerLine: string): string {
  if (headerLine.includes(",")) return ",";
  if (headerLine.includes(";")) return ";";
  if (headerLine.includes("\t")) return "\t";
  return ",";
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const firstBreak = text.search(/[\r\n]/);
  const delimiter = sniffDelimiter(firstBreak === -1 ? text : text.slice(0, firstBreak));

  const [headerRecord, ...rest] = records(text, delimiter);
  if (!headerRecord) return { headers: [], rows: [] };

  const headers = headerRecord.map((header) => header.trim());
  const rows = rest.map((record) => {
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      // First wins where a header repeats, which no export here does.
      if (header && !(header in row)) row[header] = (record[index] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

/**
 * A row's value by any of several header names, whatever their case.
 *
 * The exports renamed columns between versions (`Const`, then `const`; `s_no`
 * beside `season_number`), so a reader asks for all the names a value has gone
 * by and takes the first that is filled.
 */
export function field(row: CsvRow, ...names: string[]): string {
  for (const name of names) {
    const exact = row[name];
    if (exact) return exact;
  }
  const lower = names.map((name) => name.toLowerCase());
  for (const [key, value] of Object.entries(row)) {
    if (value && lower.includes(key.toLowerCase())) return value;
  }
  return "";
}

/** Whether a header set has a column by any of these names, whatever their case. */
export function hasColumn(headers: string[], ...names: string[]): boolean {
  const lower = new Set(headers.map((header) => header.toLowerCase()));
  return names.some((name) => lower.has(name.toLowerCase()));
}
