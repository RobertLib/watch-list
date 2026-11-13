/**
 * Reads the files out of a ZIP archive, in the browser, with nothing installed.
 *
 * Letterboxd, Trakt and TV Time all hand over their export as a ZIP, and
 * "unzip it first, then pick these four files out of the forty" is where an
 * import loses people. So the archive is read as it is: the directory at its
 * end says where each file starts and how it was stored, and the browser's own
 * `DecompressionStream` inflates it.
 *
 * Deliberately small. It reads what those exports are – stored or deflated
 * entries, no encryption, no ZIP64 – and refuses the rest by name rather than
 * guessing. Only the entries a caller asks for are inflated: an export also
 * carries the account's profile, email address and device list, and there is
 * no reason for this page to ever hold those in memory.
 */

/** One file in an archive, not yet read. */
export interface ZipEntry {
  /** Path inside the archive, as written: `lists/watchlist.csv`. */
  name: string;
  /** Bytes once inflated, as the archive's directory states them. */
  size: number;
  /** The file's contents as text (UTF-8). */
  text: () => Promise<string>;
}

/** The most one entry may inflate to. The exports' largest files are a few MB. */
export const MAX_ENTRY_BYTES = 40 * 1024 * 1024;

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
/** The end record is 22 bytes plus a comment of up to 65,535. */
const END_SEARCH_BYTES = 22 + 0xffff;

const STORED = 0;
const DEFLATED = 8;

export class ZipError extends Error {}

/**
 * Inflate one entry's bytes.
 *
 * Written to the stream and read back chunk by chunk, rather than through
 * `Blob.stream()` and `Response` – both of which are missing somewhere this
 * runs – and counted as it goes: the size an archive's directory states is the
 * archive's claim, and a few kilobytes that inflate without end are how a
 * hostile one is built.
 */
async function inflate(data: Uint8Array, name: string): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new ZipError(
      "This browser cannot open ZIP files. Unzip the export and choose the files inside it instead.",
    );
  }
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  const read = async () => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_ENTRY_BYTES) {
        await reader.cancel();
        throw new ZipError(`${name} is too large to read here.`);
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  };

  try {
    const [out] = await Promise.all([
      read(),
      // A writer that is never drained would wait for ever; both run together.
      writer.write(data as BufferSource).then(() => writer.close()),
    ]);
    return out;
  } catch (error) {
    if (error instanceof ZipError) throw error;
    throw new ZipError(`That archive is damaged: ${name} could not be unpacked.`);
  }
}

/**
 * The entries of a ZIP, read from its central directory. Directories are left
 * out; nothing is inflated until an entry's `text()` is called.
 */
export function readZip(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // The end record is at the very end, before an optional comment: search
  // backwards for its signature.
  let end = -1;
  for (
    let offset = buffer.byteLength - 22;
    offset >= Math.max(0, buffer.byteLength - END_SEARCH_BYTES);
    offset--
  ) {
    if (view.getUint32(offset, true) === END_OF_DIRECTORY) {
      end = offset;
      break;
    }
  }
  if (end === -1) throw new ZipError("That file is not a ZIP archive.");

  const count = view.getUint16(end + 10, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (count === 0xffff || directoryOffset === 0xffffffff) {
    throw new ZipError("That archive is too large to read here (ZIP64).");
  }

  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  let offset = directoryOffset;

  for (let index = 0; index < count; index++) {
    if (offset + 46 > buffer.byteLength || view.getUint32(offset, true) !== DIRECTORY_ENTRY) {
      throw new ZipError("That archive is damaged: its directory could not be read.");
    }

    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    // A directory is an entry whose name ends in a slash and holds nothing.
    if (name.endsWith("/")) continue;

    entries.push({
      name,
      size,
      text: async () => {
        if (flags & 0x1) throw new ZipError(`${name} is encrypted and cannot be read.`);
        if (size > MAX_ENTRY_BYTES) throw new ZipError(`${name} is too large to read here.`);
        if (
          localOffset + 30 > buffer.byteLength ||
          view.getUint32(localOffset, true) !== LOCAL_HEADER
        ) {
          throw new ZipError(`That archive is damaged: ${name} could not be found in it.`);
        }
        // The local header repeats the name and has an extra field of its own
        // length, so the data starts after *its* lengths, not the directory's.
        const start =
          localOffset +
          30 +
          view.getUint16(localOffset + 26, true) +
          view.getUint16(localOffset + 28, true);
        const data = bytes.subarray(start, start + compressedSize);

        if (method === STORED) return decoder.decode(data);
        if (method === DEFLATED) return decoder.decode(await inflate(data, name));
        throw new ZipError(`${name} is compressed in a way this page cannot read.`);
      },
    });
  }

  return entries;
}

/** Whether a file looks like a ZIP: by its first bytes, not its name. */
export function isZip(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const signature = new DataView(buffer).getUint32(0, true);
  // A local file header, or the end record of an archive with nothing in it.
  return signature === LOCAL_HEADER || signature === END_OF_DIRECTORY;
}
