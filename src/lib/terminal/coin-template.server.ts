/**
 * Pure-TypeScript patcher for the public SuiPump coin template.
 *
 * SuiPump's website publishes a one-module coin package (`template.mv`, module
 * `suipump`, witness `SUIPUMP`) where the coin metadata lives in a single
 * constant-pool blob and the decimals in another. The website patches those two
 * constants with @mysten/move-bytecode-template (wasm) and publishes the result.
 *
 * Workers cannot compile wasm at runtime, so this performs the same edit directly
 * on the Move binary: re-serialise the constant-pool table and fix the table
 * offsets that follow it. Output is byte-identical to the wasm patcher, which
 * matters because SuiPump's launch-ticket issuer re-derives the expected bytes.
 */

const CONSTANT_POOL_KIND = 0x6;
const HEADER_PREFIX_BYTES = 8; // magic (4) + version/flavour (4)

export function encodeUleb(value: number): number[] {
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

export function encodeString(value: string): number[] {
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

export interface Cursor {
  offset: number;
}

export function readUleb(bytes: Uint8Array, cursor: Cursor): number {
  let result = 0;
  let shift = 0;
  for (;;) {
    const byte = bytes[cursor.offset++]!;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return result;
    shift += 7;
  }
}

/** Table header entry: kind, byte offset into the body, byte length. */
interface TableEntry {
  kind: number;
  offset: number;
  length: number;
}

export interface ParsedModule {
  prefix: Uint8Array;
  tables: TableEntry[];
  body: Uint8Array;
}

export function parseModule(bytes: Uint8Array): ParsedModule {
  const cursor: Cursor = { offset: HEADER_PREFIX_BYTES };
  const tableCount = readUleb(bytes, cursor);
  const tables: TableEntry[] = [];
  for (let index = 0; index < tableCount; index += 1) {
    const kind = bytes[cursor.offset++]!;
    const offset = readUleb(bytes, cursor);
    const length = readUleb(bytes, cursor);
    tables.push({ kind, offset, length });
  }
  return {
    prefix: bytes.slice(0, HEADER_PREFIX_BYTES),
    tables,
    body: bytes.slice(cursor.offset),
  };
}

export function serializeModule(parsed: ParsedModule): Uint8Array {
  const header: number[] = [...encodeUleb(parsed.tables.length)];
  for (const table of parsed.tables) {
    header.push(table.kind, ...encodeUleb(table.offset), ...encodeUleb(table.length));
  }
  const out = new Uint8Array(parsed.prefix.length + header.length + parsed.body.length);
  out.set(parsed.prefix, 0);
  out.set(header, parsed.prefix.length);
  out.set(parsed.body, parsed.prefix.length + header.length);
  return out;
}

/** One constant-pool entry: a signature token, then a length-delimited blob. */
interface ConstantEntry {
  signature: Uint8Array;
  data: Uint8Array;
}

/** Enough of the signature-token grammar to skip constant types (incl. vectors). */
function skipSignatureToken(body: Uint8Array, cursor: Cursor): void {
  const token = body[cursor.offset++]!;
  if (token === 0x0a) skipSignatureToken(body, cursor); // VECTOR wraps one token
}

function readConstantPool(body: Uint8Array, table: TableEntry): ConstantEntry[] {
  const end = table.offset + table.length;
  const cursor: Cursor = { offset: table.offset };
  const entries: ConstantEntry[] = [];
  while (cursor.offset < end) {
    const signatureStart = cursor.offset;
    skipSignatureToken(body, cursor);
    const signature = body.slice(signatureStart, cursor.offset);
    const length = readUleb(body, cursor);
    const data = body.slice(cursor.offset, cursor.offset + length);
    cursor.offset += length;
    entries.push({ signature, data });
  }
  return entries;
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
  const pool = parsed.tables.find((table) => table.kind === CONSTANT_POOL_KIND);
  if (!pool) throw new Error("The coin template has no constant pool.");

  const entries = readConstantPool(parsed.body, pool);
  if (entries.length < 2) throw new Error("The coin template constant pool is not the expected shape.");
  entries[0] = {
    signature: entries[0]!.signature,
    data: Uint8Array.from([Math.max(0, Math.min(18, Math.round(meta.decimals)))]),
  };
  entries[1] = { signature: entries[1]!.signature, data: Uint8Array.from(encodeMetadataBlob(meta)) };

  const replacement = writeConstantPool(entries);
  const delta = replacement.length - pool.length;
  const poolEnd = pool.offset + pool.length;

  const body = new Uint8Array(parsed.body.length + delta);
  body.set(parsed.body.slice(0, pool.offset), 0);
  body.set(replacement, pool.offset);
  body.set(parsed.body.slice(poolEnd), pool.offset + replacement.length);

  const tables = parsed.tables.map((table) => {
    if (table.kind === CONSTANT_POOL_KIND) return { ...table, length: replacement.length };
    return table.offset > pool.offset ? { ...table, offset: table.offset + delta } : table;
  });

  return serializeModule({ prefix: parsed.prefix, tables, body });
}

/** Fetches the public SuiPump coin template. */
export async function fetchCoinTemplate(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { accept: "application/octet-stream" } });
  if (!response.ok) throw new Error("The coin template could not be downloaded.");
  return new Uint8Array(await response.arrayBuffer());
}
