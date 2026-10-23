// SPDX-License-Identifier: BUSL-1.1
/** Find the payees (vector<address>) + shares (vector<u64>, sum 10000) pure inputs of a launch tx. */
export function decodeFeeSplit(inputs: { kind: string; pure?: string }[]): { payees: string[]; bps: number[] } | null {
  const pures = inputs.map((i) => (i.kind === "PURE" && i.pure ? Uint8Array.from(atob(i.pure), (c) => c.charCodeAt(0)) : null));
  const asAddrs = (b: Uint8Array | null) => {
    if (!b || b.length < 1) return null;
    const n = b[0]!;
    if (n === 0 || n > 127 || b.length !== 1 + n * 32) return null;
    return Array.from({ length: n }, (_, k) => "0x" + Array.from(b.slice(1 + k * 32, 33 + k * 32), (x) => x.toString(16).padStart(2, "0")).join(""));
  };
  const asU64s = (b: Uint8Array | null, n: number) => {
    if (!b || b.length !== 1 + n * 8 || b[0] !== n) return null;
    const dv = new DataView(b.buffer, b.byteOffset + 1);
    return Array.from({ length: n }, (_, k) => Number(dv.getBigUint64(k * 8, true)));
  };
  for (let i = 0; i < pures.length - 1; i++) {
    const payees = asAddrs(pures[i]!);
    if (!payees) continue;
    const bps = asU64s(pures[i + 1]!, payees.length);
    if (bps && bps.reduce((a, b) => a + b, 0) === 10000) return { payees, bps };
  }
  return null;
}
