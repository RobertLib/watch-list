import { deflateRawSync } from "node:zlib";

/**
 * Builds a ZIP archive in memory, for the import tests.
 *
 * Written out by hand rather than taken from a library so the tests can make
 * the archives a library would never produce on request: an entry with a method
 * the reader does not support, a local header whose extra field differs from
 * the directory's, an encrypted flag, a trailing comment.
 */

export interface ZipFixtureEntry {
  name: string;
  content: string;
  /** Store rather than deflate. */
  stored?: boolean;
  /** Bytes of extra field in the local header only. */
  localExtra?: number;
  /** Claim this compression method instead of the real one. */
  method?: number;
  /** Set the "encrypted" flag. */
  encrypted?: boolean;
}

export function buildZip(
  entries: ZipFixtureEntry[],
  options: { comment?: string } = {},
): ArrayBuffer {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const raw = encoder.encode(entry.content);
    const isDirectory = entry.name.endsWith("/");
    const stored = entry.stored || isDirectory;
    const data = stored ? raw : new Uint8Array(deflateRawSync(raw));
    const method = entry.method ?? (stored ? 0 : 8);
    // Bit 11: the name is UTF-8. Bit 0: encrypted.
    const flags = 0x0800 | (entry.encrypted ? 0x1 : 0);
    const extra = new Uint8Array(entry.localExtra ?? 0);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, flags, true);
    local.setUint16(8, method, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, extra.length, true);
    chunks.push(new Uint8Array(local.buffer), name, extra, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, flags, true);
    central.setUint16(10, method, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, raw.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    directory.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + extra.length + data.length;
  }

  const directorySize = directory.reduce((total, part) => total + part.length, 0);
  const comment = encoder.encode(options.comment ?? "");
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, comment.length, true);

  const parts = [...chunks, ...directory, new Uint8Array(end.buffer), comment];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out.buffer as ArrayBuffer;
}
