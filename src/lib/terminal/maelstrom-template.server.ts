/**
 * Pure-TypeScript patcher for the coin module Maelstrom publishes for a launch.
 *
 * Maelstrom's launch form publishes a one-module coin whose `init` registers the
 * currency through 0x2::coin_registry, mints the whole supply to the sender,
 * makes the supply burn-only and deletes the metadata cap (so name, symbol,
 * description and image are frozen forever). Its four text constants are tagged
 * with a single leading letter — "S" symbol, "N" name, "D" description,
 * "I" icon — which `untag` strips at runtime; we keep the tag and swap the rest,
 * plus the module and witness identifiers. Same edit the website makes with the
 * wasm template tool.
 */
import {
  encodeString,
  encodeUleb,
  parseModule,
  readUleb,
  serializeModule,
  zeroSelfAddress,
} from "./coin-template.server";


const CONSTANTS_KIND = 0x6;
const IDENTIFIERS_KIND = 0x7;
const TOKEN_VECTOR = 0x0a;
const TOKEN_U8 = 0x02;

export interface MaelstromCoinMeta {
  module: string;
  struct: string;
  symbol: string;
  name: string;
  description: string;
  iconUrl: string;
}

function replaceTable(
  bytes: Uint8Array,
  kind: number,
  build: (body: Uint8Array, start: number, end: number) => number[],
): Uint8Array {
  const parsed = parseModule(bytes);
  const index = parsed.tables.findIndex((table) => table.kind === kind);
  const table = parsed.tables[index];
  if (!table) throw new Error(`Coin template has no table ${kind}.`);
  const tableBytes = build(parsed.body, table.offset, table.offset + table.length);
  const delta = tableBytes.length - table.length;
  const body = new Uint8Array(parsed.body.length + delta);
  body.set(parsed.body.slice(0, table.offset), 0);
  body.set(tableBytes, table.offset);
  body.set(parsed.body.slice(table.offset + table.length), table.offset + tableBytes.length);
  parsed.tables = parsed.tables.map((entry, i) => {
    if (i === index) return { ...entry, length: tableBytes.length };
    if (entry.offset > table.offset) return { ...entry, offset: entry.offset + delta };
    return entry;
  });
  parsed.body = body;
  return serializeModule(parsed);
}

function readStrings(body: Uint8Array, start: number, end: number): string[] {
  const cursor = { offset: start };
  const out: string[] = [];
  while (cursor.offset < end) {
    const length = Number(readUleb(body, cursor));
    out.push(new TextDecoder().decode(body.slice(cursor.offset, cursor.offset + length)));
    cursor.offset += length;
  }
  return out;
}

type Constant = { token: number[]; data: Uint8Array };

/** Reads the constant pool; scalar constants pass through untouched. */
function readConstants(body: Uint8Array, start: number, end: number): Constant[] {
  const cursor = { offset: start };
  const out: Constant[] = [];
  while (cursor.offset < end) {
    const first = body[cursor.offset++] as number;
    const token = first === TOKEN_VECTOR ? [first, body[cursor.offset++] as number] : [first];
    const length = Number(readUleb(body, cursor));
    out.push({ token, data: body.slice(cursor.offset, cursor.offset + length) });
    cursor.offset += length;
  }
  return out;
}

const isTextConstant = (constant: Constant) => constant.token.length === 2 && constant.token[1] === TOKEN_U8;

/** Decodes a vector<u8> constant (BCS: uleb length + bytes) to text. */
function constantText(constant: Constant): string | null {
  if (!isTextConstant(constant)) return null;
  const cursor = { offset: 0 };
  const length = Number(readUleb(constant.data, cursor));
  return new TextDecoder().decode(constant.data.slice(cursor.offset, cursor.offset + length));
}

export function readMaelstromTemplate(bytes: Uint8Array): { identifiers: string[]; strings: string[] } {
  const parsed = parseModule(bytes);
  const ids = parsed.tables.find((table) => table.kind === IDENTIFIERS_KIND)!;
  const consts = parsed.tables.find((table) => table.kind === CONSTANTS_KIND)!;
  return {
    identifiers: readStrings(parsed.body, ids.offset, ids.offset + ids.length),
    strings: readConstants(parsed.body, consts.offset, consts.offset + consts.length)
      .map(constantText)
      .filter((value): value is string => value !== null),
  };
}

export function patchMaelstromTemplate(
  template: Uint8Array,
  from: { module: string; struct: string },
  meta: MaelstromCoinMeta,
): Uint8Array {
  const withIds = replaceTable(template, IDENTIFIERS_KIND, (body, start, end) => {
    const ids = readStrings(body, start, end);
    if (!ids.includes(from.module) || !ids.includes(from.struct)) {
      throw new Error("Coin template identifiers not found.");
    }
    return ids
      .map((id) => (id === from.module ? meta.module : id === from.struct ? meta.struct : id))
      .flatMap(encodeString);
  });
  const withConstants = replaceTable(withIds, CONSTANTS_KIND, (body, start, end) => {
    const constants = readConstants(body, start, end);
    const textIndexes = constants.flatMap((constant, index) => (isTextConstant(constant) ? [index] : []));
    if (textIndexes.length !== 4) throw new Error("Coin template must have exactly four text constants.");
    const values = [meta.symbol, meta.name, meta.description, meta.iconUrl];
    return constants.flatMap((constant, index) => {
      const slot = textIndexes.indexOf(index);
      if (slot < 0) return [...constant.token, ...encodeUleb(constant.data.length), ...constant.data];
      // Keep the template's one-letter tag; only the value behind it changes.
      const tag = (constantText(constant) ?? " ").slice(0, 1);
      const data = new Uint8Array(encodeString(tag + (values[slot] as string)));
      return [...constant.token, ...encodeUleb(data.length), ...data];
    });
  });
}
