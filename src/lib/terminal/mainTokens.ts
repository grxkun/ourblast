// SPDX-License-Identifier: BUSL-1.1
/**
 * Main Sui tokens every OURBLAST surface (Terminal, X, Telegram) resolves by
 * ticker without asking for a contract. Coin types and decimals verified on
 * mainnet via the official Sui GraphQL coinMetadata.
 */
import { BLAST_BUILD } from "@/lib/blast-build.config";

export interface MainToken { symbol: string; name: string; coinType: string; decimals: number }

export const MAIN_TOKENS: MainToken[] = [
  { symbol: "BLAST", name: "BLAST", coinType: BLAST_BUILD.blastTokenType, decimals: 9 },
  { symbol: "USDC", name: "USDC", coinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", decimals: 6 },
  { symbol: "LOFI", name: "LOFI", coinType: "0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503::LOFI::LOFI", decimals: 9 },
  { symbol: "ZUK", name: "Zuk", coinType: "0x42ba9220e980b4819e4df208dd50013d0bbbfde142996e8db1319ac61f879205::zuk::ZUK", decimals: 6 },
  { symbol: "BLUB", name: "BLUB", coinType: "0xfa7ac3951fdca92c5200d468d31a365eb03b2be9936fde615e69f0c1274ad3a0::BLUB::BLUB", decimals: 2 },
  { symbol: "CETUS", name: "Cetus", coinType: "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS", decimals: 9 },
  { symbol: "SEND", name: "SEND", coinType: "0xb45fcfcc2cc07ce0702cc2d229621e046c906ef14d9b25e8e4d25f6e8763fef7::send::SEND", decimals: 6 },
  { symbol: "BLUE", name: "Bluefin", coinType: "0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE", decimals: 9 },
  { symbol: "WAL", name: "Walrus", coinType: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL", decimals: 9 },
  { symbol: "DEEP", name: "DeepBook", coinType: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP", decimals: 6 },
  { symbol: "SOH", name: "Strait of Hormuz", coinType: "0x62c9f760d935a44855424d11f8e979824070c751dd1966c4d1b9d2f8c479a35e::soh::SOH", decimals: 6 },
];

const BY_SYMBOL = new Map(MAIN_TOKENS.map((t) => [t.symbol, t]));

/** "$wal" / "WAL" → the main token, or undefined. */
export function mainToken(symbol: string): MainToken | undefined {
  return BY_SYMBOL.get(symbol.trim().replace(/^\$/, "").toUpperCase());
}

/** Main token by full coin type (case-insensitive address, exact struct). */
export function mainTokenByType(coinType: string): MainToken | undefined {
  const [addr, ...rest] = coinType.split("::");
  const tail = rest.join("::");
  const short = (a: string) => a.toLowerCase().replace(/^0x0*/, "");
  return MAIN_TOKENS.find((t) => {
    const [ta, ...tr] = t.coinType.split("::");
    return short(ta!) === short(addr ?? "") && tr.join("::") === tail;
  });
}
