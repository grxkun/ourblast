// SPDX-License-Identifier: BUSL-1.1
import type { WalletSnapshot } from "./walletChat";

/** Reads the linked X account's OurBank wallet. Every network read runs in parallel; a failed read shows as empty, never invented. */
export async function walletSnapshot(handle: string, opts: { sui?: boolean; other?: boolean } = { sui: true, other: true }): Promise<WalletSnapshot> {
  const [{ ensureBankWallet, bankBalances }, { rpc }, { ensureEvmDepositAddress }, { ensureSolDepositAddress }, { evmBalances, solBalances }, { aftermathPrices }] =
    await Promise.all([
      import("@/lib/terminal/bank-wallet.server"),
      import("@/lib/terminal/suipump-launch.server"),
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
  const suiTask = opts.sui
    ? (async () => {
        const raw = await bankBalances(wallet.address).catch(() => []);
        const [metas, prices] = await Promise.all([
          Promise.all(raw.map((b) => rpc<{ symbol: string; decimals: number } | null>("suix_getCoinMetadata", [b.coinType]).catch(() => null))),
          aftermathPrices(raw.map((b) => b.coinType)),
        ]);
        return raw.map((b, i) => {
          const amount = Number(b.balance) / 10 ** (metas[i]?.decimals ?? 9);
          const p = prices[b.coinType];
          return { coinType: b.coinType, symbol: metas[i]?.symbol ?? b.coinType.split("::").at(-1)!, amount, usd: p != null ? p * amount : null };
        });
      })()
    : Promise.resolve([]);
  const [sui, evm, sol] = await Promise.all([
    suiTask,
    opts.other && evmAddress ? evmBalances(evmAddress).catch(() => []) : Promise.resolve([]),
    opts.other && solAddress ? solBalances(solAddress).catch(() => null) : Promise.resolve(null),
  ]);
  return { handle, address: wallet.address, evmAddress, solAddress, sui, evm, sol };
}
