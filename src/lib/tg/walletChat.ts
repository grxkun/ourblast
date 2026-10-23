// SPDX-License-Identifier: BUSL-1.1
/** Pure formatters for the bot chat's /balance, /wallet and /positions replies — each answers a different question. */
export interface SuiHolding { coinType: string; symbol: string; amount: number; usd: number | null }
export interface ChainBal { chain: string; eth: number; usdc: number | null; native: string }
export interface WalletSnapshot {
  handle: string;
  address: string;
  evmAddress: string | null;
  solAddress: string | null;
  sui: SuiHolding[];
  suiError?: string;
  evm: ChainBal[];
  sol: { sol: number; usdc: number } | null;
}

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 2 : 6 });
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;

/** Merges duplicate tickers by coin type and sorts: SUI first, then by USD value, then by amount. */
export function sortHoldings(list: SuiHolding[]): SuiHolding[] {
  return [...list].filter((h) => h.amount > 0).sort((a, b) => {
    const as = a.coinType.endsWith("::sui::SUI") ? 1 : 0, bs = b.coinType.endsWith("::sui::SUI") ? 1 : 0;
    if (as !== bs) return bs - as;
    if ((b.usd ?? -1) !== (a.usd ?? -1)) return (b.usd ?? -1) - (a.usd ?? -1);
    return b.amount - a.amount;
  });
}

/** Shows a short contract tail when two holdings share a ticker, so look-alike tokens are distinguishable. */
function labels(list: SuiHolding[]): string[] {
  const counts = new Map<string, number>();
  for (const h of list) counts.set(h.symbol, (counts.get(h.symbol) ?? 0) + 1);
  return list.map((h) => (counts.get(h.symbol)! > 1 ? `${h.symbol} (${h.coinType.split("::")[0]!.slice(0, 6)}…)` : h.symbol));
}

export function formatBalance(s: WalletSnapshot): string {
  const sui = sortHoldings(s.sui);
  const names = labels(sui);
  const lines = sui.map((h, i) => `• ${num(h.amount)} ${names[i]}${h.usd != null ? ` ≈ ${usd(h.usd)}` : ""}`);
  const other: string[] = [];
  for (const c of s.evm) {
    if (c.eth > 0) other.push(`• ${num(c.eth)} ${c.native} (${c.chain})`);
    if (c.usdc) other.push(`• ${num(c.usdc)} USDC (${c.chain})`);
  }
  if (s.sol?.sol) other.push(`• ${num(s.sol.sol)} SOL (Solana)`);
  if (s.sol?.usdc) other.push(`• ${num(s.sol.usdc)} USDC (Solana)`);
  const total = sui.reduce((t, h) => t + (h.usd ?? 0), 0);
  return [
    `💰 Balance — @${s.handle}`,
    "",
    "Sui:",
    ...(s.suiError ? [s.suiError] : lines.length ? lines : ["• empty"]),
    ...(other.length ? ["", "Other chains:", ...other] : []),
    ...(total > 0 ? ["", `Sui tokens with a live price: ≈ ${usd(total)}`] : []),
    "",
    "/wallet for deposit addresses · /positions for token values",
  ].join("\n");
}

export function formatWallet(s: WalletSnapshot): string {
  return [
    `👛 Deposit addresses — @${s.handle}`,
    "",
    `Sui (SUI + Sui tokens):\n${s.address}`,
    s.evmAddress ? `\nEVM (ETH on Base/Arbitrum/Robinhood, BNB on BNB Chain):\n${s.evmAddress}` : "",
    s.solAddress ? `\nSolana (SOL, USDC):\n${s.solAddress}` : "",
    "",
    "Only send each asset on its own chain. Deposits on other chains stay there until you say e.g. bridge 0.05 sol to sui.",
  ].filter((l) => l !== "").join("\n");
}

export function formatPositions(s: WalletSnapshot): string {
  if (s.suiError) return s.suiError;
  const tokens = sortHoldings(s.sui).filter((h) => !h.coinType.endsWith("::sui::SUI"));
  if (!tokens.length) return "📊 No token positions yet. Paste a $TICKER or contract to buy.";
  const names = labels(tokens);
  const total = tokens.reduce((t, h) => t + (h.usd ?? 0), 0);
  return [
    `📊 Positions — @${s.handle}`,
    "",
    ...tokens.map((h, i) => `• ${names[i]}: ${num(h.amount)}${h.usd != null ? ` ≈ ${usd(h.usd)}` : " · no live price"}`),
    ...(total > 0 ? ["", `Total priced: ≈ ${usd(total)}`] : []),
    "",
    "Profit/loss isn't shown — buy prices aren't tracked yet. Sell with e.g. sell 50% $BLAST.",
  ].join("\n");
}
