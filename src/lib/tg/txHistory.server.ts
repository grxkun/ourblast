// SPDX-License-Identifier: BUSL-1.1
/**
 * Every transaction touching the user's OurBank wallets, read from chain (official GraphQL),
 * so activity done outside OURBLAST shows up too.
 */
import type { TxItem } from "./txHistory";
import { toDisplay } from "./txHistory";

type Node = {
  digest: string; sender: { address: string } | null;
  effects: { timestamp: string | null; status: string; balanceChanges: { nodes: { amount: string; coinType: { repr: string }; owner: { address: string } | null }[] } } | null;
};

export async function walletTransactions(tgUserId: number, handle: string, limit = 20): Promise<TxItem[]> {
  const { listTgWallets } = await import("./tgWallets.server");
  const { ensureBankWallet } = await import("@/lib/terminal/bank-wallet.server");
  const { suiGql } = await import("@/lib/terminal/sui-rpc-compat.server");
  const { readCoinMetadata } = await import("@/lib/terminal/sui-balances.server");
  const { normalizeSuiAddress } = await import("@mysten/sui/utils");
  const { wallets } = await listTgWallets(tgUserId, handle);
  const addrs = await Promise.all(wallets.map(async (w) => ({ slot: w.slot, address: normalizeSuiAddress((await ensureBankWallet(w.handle, null)).address) })));
  const meta = new Map<string, Promise<{ symbol: string; decimals: number } | null>>();
  const lookup = (t: string) => { if (!meta.has(t)) meta.set(t, readCoinMetadata(t).catch(() => null)); return meta.get(t)!; };
  const per = await Promise.all(addrs.map(async ({ slot, address }) => {
    const d = await suiGql<{ transactions: { nodes: Node[] } }>(
      `query($a:SuiAddress!,$n:Int){transactions(last:$n,filter:{affectedAddress:$a}){nodes{digest sender{address} effects{timestamp status balanceChanges(first:20){nodes{amount coinType{repr} owner{address}}}}}}}`,
      { a: address, n: Math.min(limit, 50) },
    ).catch(() => null);
    return Promise.all((d?.transactions.nodes ?? []).map(async (n): Promise<TxItem> => {
      const mine = (n.effects?.balanceChanges.nodes ?? []).filter((c) => c.owner && normalizeSuiAddress(c.owner.address) === address);
      const changes = await Promise.all(mine.map(async (c) => {
        const m = await lookup(c.coinType.repr);
        return { symbol: m?.symbol ?? c.coinType.repr.split("::").pop()!, amount: toDisplay(c.amount, m?.decimals ?? 9) };
      }));
      return {
        digest: n.digest, wallet: address, slot, time: n.effects?.timestamp ?? null,
        ok: n.effects?.status === "SUCCESS",
        outgoing: Boolean(n.sender && normalizeSuiAddress(n.sender.address) === address),
        changes: changes.filter((c) => c.amount !== 0),
      };
    }));
  }));
  const seen = new Set<string>();
  return per.flat()
    .sort((a, b) => Date.parse(b.time ?? "0") - Date.parse(a.time ?? "0"))
    .filter((t) => (seen.has(t.digest + t.slot) ? false : (seen.add(t.digest + t.slot), true)))
    .slice(0, limit);
}
