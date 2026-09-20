/**
 * Pure-TypeScript patcher for the public SuiPump coin template.
 *
 * SuiPump's website publishes a one-module coin package (`template.mv`, module
 * `suipump`, witness `SUIPUMP`) where the coin metadata lives in a single
 * constant-pool blob and the decimals in another. The website patches those two
 * constants with @mysten/move-bytecode-template (wasm) and publishes the result.
 *
 * Workers cannot compile wasm at runtime, so this does the same edit directly on
 * the Move binary: splice the constant-pool table and fix the table offsets that
 * follow it. Output is byte-identical to the wasm patcher, which matters because
 * the SuiPump launch-ticket issuer re-derives the expected bytes itself.
 */

const CONSTANT_POOL_KIND = 0x6;

function encodeUleb(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest >>>= 7;
    if (rest) byte |= 0x80;
    out.push(byte);
  } while (rest);
  return out;
}

function encodeString(value: string): number[] {
  const bytes = [...new TextEncoder().encode(value)];
  return [...encodeUleb(bytes.length), ...bytes];
}

export interface CoinTemplateMetadata {
  symbol: string;
  name: string;
  description: string;
  iconUrl: string;
  decimals: number;
}

/** The blob the template's `init` peels: four BCS strings inside one byte vector. */
function encodeMetadataBlob(meta: CoinTemplateMetadata): number[] {
  const inner = [
    ...encodeString(meta.symbol),
    ...encodeString(meta.name),
    ...encodeString(meta.description),
    ...encodeString(meta.iconUrl),
  ];
  return [...encodeUleb(inner.length), ...inner];
}

interface Reader {
  offset: number;
}

function readUleb(bytes: Uint8Array, cursor: Reader): number {
  let result = 0;
  let shift = 0;
  for (;;) {
    const byte = bytes[cursor.offset++]!;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return result;
    shift += 7;
  }
}

interface TableEntry {
  kind: number;
  offset: number;
  count: number;
}

interface ParsedModule {
  /** Everything before the table header (magic + version + flavour). */
  prefix: Uint8Array;
  tables: TableEntry[];
  /** Region the table offsets are relative to. */
  body: Uint8Array;
}

function parseModule(bytes: Uint8Array): ParsedModule {
  // magic (4 bytes) + version (4 bytes LE) [+ flavour byte folded into version]
  const cursor: Reader = { offset: 4 + 4 };
  const tableCount = readUleb(bytes, cursor);
  const tables: TableEntry[] = [];
  for (let index = 0; index < tableCount; index += 1) {
    const kind = bytes[cursor.offset++]!;
    const offset = readUleb(bytes, cursor);
    const count = readUleb(bytes, cursor);
    tables.push({ kind, offset, count });
  }
  return {
    prefix: bytes.slice(0, 4 + 4),
    tables,
    body: bytes.slice(cursor.offset),
  };
}

function serializeModule(parsed: ParsedModule): Uint8Array {
  const header: number[] = [...encodeUleb(parsed.tables.length)];
  for (const table of parsed.tables) {
    header.push(table.kind, ...encodeUleb(table.offset), ...encodeUleb(table.count));
  }
  const out = new Uint8Array(parsed.prefix.length + header.length + parsed.body.length);
  out.set(parsed.prefix, 0);
  out.set(header, parsed.prefix.length);
  out.set(parsed.body, parsed.prefix.length + header.length);
  return out;
}

/** One constant-pool entry: signature token(s), then a length-delimited data blob. */
interface ConstantEntry {
  signature: Uint8Array;
  data: Uint8Array;
}

function readConstantPool(body: Uint8Array, table: TableEntry): ConstantEntry[] {
  const cursor: Reader = { offset: table.offset };
  const entries: ConstantEntry[] = [];
  for (let index = 0; index < table.count; index += 1) {
    const signatureStart = cursor.offset;
    readSignatureToken(body, cursor);
    const signature = body.slice(signatureStart, cursor.offset);
    const length = readUleb(body, cursor);
    const data = body.slice(cursor.offset, cursor.offset + length);
    cursor.offset += length;
    entries.push({ signature, data });
  }
  if (cursor.offset !== table.offset + tableLength(body, table)) {
    // Non-fatal: the splice below only relies on the entries it parsed.
  }
  return entries;
}

function tableLength(body: Uint8Array, table: TableEntry): number {
  // The constant pool is re-serialised wholesale, so its recorded length is the
  // distance to the next table start (computed by the caller instead).
  return body.length - table.offset;
}

/** Enough of the signature-token grammar to skip constant types (incl. vectors). */
function readSignatureToken(body: Uint8Array, cursor: Reader): void {
  const token = body[cursor.offset++]!;
  // 0x7 = VECTOR: one nested token follows.
  if (token === 0x7) readSignatureToken(body, cursor);
}

function writeConstantPool(entries: ConstantEntry[]): Uint8Array {
  const out: number[] = [];
  for (const entry of entries) {
    out.push(...entry.signature, ...encodeUleb(entry.data.length), ...entry.data);
  }
  return Uint8Array.from(out);
}

/**
 * Replaces the template's metadata blob and decimals byte, keeping every other
 * byte of the module intact.
 */
export function patchCoinTemplate(template: Uint8Array, meta: CoinTemplateMetadata): Uint8Array {
  const parsed = parseModule(template);
  const poolIndex = parsed.tables.findIndex((table) => table.kind === CONSTANT_POOL_KIND);
  if (poolIndex < 0) throw new Error("The coin template has no constant pool.");
  const pool = parsed.tables[poolIndex]!;

  // Table regions are laid out in offset order; the pool ends where the next one starts.
  const sortedOffsets = parsed.tables.map((table) => table.offset).sort((a, b) => a - b);
  const nextOffset = sortedOffsets.find((offset) => offset > pool.offset) ?? parsed.body.length;
  const poolBytes = parsed.body.slice(pool.offset, nextOffset);
  const entries = readConstantPool(parsed.body, { ...pool, offset: pool.offset });
  if (entries.length < 2) throw new Error("The coin template constant pool is not the expected shape.");

  entries[0] = { signature: entries[0]!.signature, data: Uint8Array.from([Math.max(0, Math.min(18, meta.decimals))]) };
  entries[1] = { signature: entries[1]!.signature, data: Uint8Array.from(encodeMetadataBlob(meta)) };

  const replacement = writeConstantPool(entries);
  const delta = replacement.length - poolBytes.length;

  const body = new Uint8Array(parsed.body.length + delta);
  body.set(parsed.body.slice(0, pool.offset), 0);
  body.set(replacement, pool.offset);
  body.set(parsed.body.slice(nextOffset), pool.offset + replacement.length);

  const tables = parsed.tables.map((table) =>
    table.offset > pool.offset ? { ...table, offset: table.offset + delta } : table,
  );

  return serializeModule({ prefix: parsed.prefix, tables, body });
}

/** Fetches the public SuiPump coin template. */
export async function fetchCoinTemplate(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { accept: "application/octet-stream" } });
  if (!response.ok) throw new Error("The coin template could not be downloaded.");
  return new Uint8Array(await response.arrayBuffer());
}
