// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { formatBalance, formatPositions, formatWallet, type WalletSnapshot } from "./walletChat";

const SUI = "0x2::sui::SUI";
const snap: WalletSnapshot = {
  handle: "grxxxkun",
  address: "0xsui",
  evmAddress: "0xevm",
  solAddress: "SoLaddr",
  sui: [
    { coinType: "0xaaa111::lads::LADS", symbol: "LADS", amount: 2000, usd: null },
    { coinType: SUI, symbol: "SUI", amount: 8.17, usd: 20 },
    { coinType: "0xbbb222::lads::LADS", symbol: "LADS", amount: 210.1, usd: null },
    { coinType: "0xccc::blast::BLAST", symbol: "BLAST", amount: 40017.77, usd: 5 },
  ],
  evm: [{ chain: "bsc", native: "BNB", eth: 0.01, usdc: null }],
  sol: { sol: 0.2, usdc: 0 },
};

describe("bot chat wallet views", () => {
  it("/wallet shows deposit addresses, not balances", () => {
    const out = formatWallet(snap);
    expect(out).toContain("0xsui");
    expect(out).toContain("0xevm");
    expect(out).toContain("SoLaddr");
    expect(out).not.toContain("BLAST");
  });
  it("/balance lists SUI first and includes other chains", () => {
    const out = formatBalance(snap);
    expect(out.indexOf("SUI")).toBeLessThan(out.indexOf("BLAST"));
    expect(out).toContain("0.01 BNB");
    expect(out).toContain("0.2 SOL");
  });
  it("/positions excludes SUI and tells same-ticker tokens apart", () => {
    const out = formatPositions(snap);
    expect(out).not.toMatch(/• SUI/);
    expect(out).toContain("LADS (0xaaa1…)");
    expect(out).toContain("LADS (0xbbb2…)");
  });
});
