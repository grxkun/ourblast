// SPDX-License-Identifier: BUSL-1.1
/**
 * Patcher for the coin module Blast.fun v2 publishes (module `blast`, witness
 * `BLAST`). Its init calls launch_ticket::new(otw, decimals, symbol, name,
 * description, icon, creator, is_account, u64) and sends the LaunchTicket and
 * SealedTreasuryCap to the sender. We swap the identifiers and the four text
 * constants, and set the creator to a plain address (is_account = false) so the
 * curve's creator rights belong to the wallet we name — never a social account.
 */
import { encodeString, encodeUleb, parseModule, readUleb, serializeModule } from "./coin-template.server";

const CONSTANTS_KIND = 0x6;
const IDENTIFIERS_KIND = 0x7;
const T_BOOL = 0x01;
const T_U8 = 0x02;
const T_U64 = 0x03;
const T_VECTOR = 0x0a;

export interface BlastV2CoinMeta {
  module: string;
  struct: string;
  symbol: string;
  name: string;
  description: string;
  iconUrl: string;
  /** 0x-prefixed Sui address that becomes the curve's creator. */
  creator: string;
}

type Constant = { token: number[]; data: Uint8Array };

function replaceTable(bytes: Uint8Array, kind: number, build: (body: Uint8Array, start: number, end: number) => number[]): Uint8Array {
  const parsed = parseModule(bytes);
  const index = parsed.tables.findIndex((t) => t.kind === kind);
  const table = parsed.tables[index];
  if (!table) throw new Error(`Coin template has no table ${kind}.`);
  const out = build(parsed.body, table.offset, table.offset + table.length);
  const delta = out.length - table.length;
  const body = new Uint8Array(parsed.body.length + delta);
  body.set(parsed.body.slice(0, table.offset), 0);
  body.set(out, table.offset);
  body.set(parsed.body.slice(table.offset + table.length), table.offset + out.length);
  parsed.tables = parsed.tables.map((e, i) =>
    i === index ? { ...e, length: out.length } : e.offset > table.offset ? { ...e, offset: e.offset + delta } : e,
  );
  parsed.body = body;
  return serializeModule(parsed);
}

function readStrings(body: Uint8Array, start: number, end: number): string[] {
  const c = { offset: start };
  const out: string[] = [];
  while (c.offset < end) {
    const n = Number(readUleb(body, c));
    out.push(new TextDecoder().decode(body.slice(c.offset, c.offset + n)));
    c.offset += n;
  }
  return out;
}

function readConstants(body: Uint8Array, start: number, end: number): Constant[] {
  const c = { offset: start };
  const out: Constant[] = [];
  while (c.offset < end) {
    const first = body[c.offset++] as number;
    const token = first === T_VECTOR ? [first, body[c.offset++] as number] : [first];
    if (![T_BOOL, T_U8, T_U64].includes(first) && !(token.length === 2 && token[1] === T_U8)) {
      throw new Error("Unexpected constant type in the Blast.fun v2 coin template.");
    }
    const n = Number(readUleb(body, c));
    out.push({ token, data: body.slice(c.offset, c.offset + n) });
    c.offset += n;
  }
  return out;
}

function addressBytes(address: string): Uint8Array {
  const hex = address.replace(/^0x/, "").padStart(64, "0");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Creator must be a Sui address.");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export function patchBlastV2Template(template: Uint8Array, from: { module: string; struct: string }, meta: BlastV2CoinMeta): Uint8Array {
  const withIds = replaceTable(template, IDENTIFIERS_KIND, (body, start, end) => {
    const ids = readStrings(body, start, end);
    if (!ids.includes(from.module) || !ids.includes(from.struct)) throw new Error("Coin template identifiers not found.");
    if (!ids.includes("launch_ticket") || !ids.includes("new_address")) throw new Error("Not a Blast.fun v2 coin template.");
    return ids.map((id) => (id === from.module ? meta.module : id === from.struct ? meta.struct : id)).flatMap(encodeString);
  });
  return replaceTable(withIds, CONSTANTS_KIND, (body, start, end) => {
    const constants = readConstants(body, start, end);
    // vector<u8> constants: the four texts, the 32-byte creator id, then unused filler.
    const vecs = constants.flatMap((k, i) => (k.token.length === 2 ? [i] : []));
    const bools = constants.flatMap((k, i) => (k.token[0] === T_BOOL ? [i] : []));
    const creatorIdx = vecs.find((i) => {
      const k = constants[i]!;
      const c = { offset: 0 };
      return Number(readUleb(k.data, c)) === 32;
    });
    if (vecs.length < 5 || creatorIdx === undefined || bools.length !== 1) throw new Error("Unexpected Blast.fun v2 coin template layout.");
    const texts = vecs.filter((i) => i !== creatorIdx).slice(0, 4);
    const values = [meta.symbol, meta.name, meta.description, meta.iconUrl];
    const creator = addressBytes(meta.creator);
    return constants.flatMap((k, i) => {
      let data = k.data;
      const slot = texts.indexOf(i);
      if (slot >= 0) data = new Uint8Array(encodeString(values[slot] as string));
      else if (i === creatorIdx) data = new Uint8Array([...encodeUleb(32), ...creator]);
      else if (i === bools[0]) data = new Uint8Array([0]); // is_account = false → creator is the address above
      return [...k.token, ...encodeUleb(data.length), ...data];
    });
  });
}
