// SPDX-License-Identifier: BUSL-1.1
import type { WalletSnapshot } from "./walletChat";

/** Reads the linked X account's OurBank wallet without disguising failed Sui reads as empty. */
export async function walletSnapshot(handle: string, opts: { sui?: boolean; other?: boolean } = { sui: true, other: true }): Promise<WalletSnapshot> {
  const [{ ensureBankWallet }, { readSuiHoldings }, { ensureEvmDepositAddress }, { ensureSolDepositAddress }, { evmBalances, solBalances }, { aftermathPrices }] =
    await Promise.all([
      import("@/lib/terminal/bank-wallet.server"),
      import("@/lib/terminal/sui-balances.server"),
      import("@/lib/terminal/bank-evm.server"),
      import("@/lib/terminal/bank-sol.server"),
      import("@/lib/terminal/chain-balances.server"),
      import("./runCommand.server"),
    ]);
  const [wallet, evmAddress, solAddress] = await Promise.all([
    ensureBankWallet(handle, null),
    ensureEvmDepositAddress(handle).catch(() => null),
    ensureSolDepositAddress(handle).catch(() => null),
  ]);
  let suiError: string | undefined;
  const suiTask = opts.sui
    ? (async () => {
        const raw = await readSuiHoldings(wallet.address);
        const prices = await aftermathPrices(raw.map((b) => b.coinType)).catch(() => ({} as Record<string, number>));
        return raw.map((b) => {
          const amount = Number(b.balance) / 10 ** (b.decimals ?? 9);
          const p = prices[b.coinType];
          return { coinType: b.coinType, symbol: b.symbol ?? b.coinType.split("::").at(-1) ?? "Token", amount, usd: p != null ? p * amount : null };
        });
      })().catch(() => { suiError = "Sui balances are temporarily unavailable. Please refresh."; return []; })
    : Promise.resolve([]);
  const [sui, evm, sol] = await Promise.all([
    suiTask,
    opts.other && evmAddress ? evmBalances(evmAddress).catch(() => []) : Promise.resolve([]),
    opts.other && solAddress ? solBalances(solAddress).catch(() => null) : Promise.resolve(null),
  ]);
  return { handle, address: wallet.address, evmAddress, solAddress, sui, suiError, evm, sol };
}
