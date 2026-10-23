// SPDX-License-Identifier: BUSL-1.1
// Blast.fun presale lookup + commit for the Telegram bot. Never commits to an unverified sale.
import { parsePresaleType, suiToMist } from "./presale";

const SUI_TYPE = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

export type PresaleInfo = {
  id: string;
  pkg: string;
  memeType: string;
  symbol: string;
  name: string | null;
  status: string | null;
  raised: string | null;
  target: string | null;
  endsAtMs: number | null;
  url: string;
};

async function getObjectType(id: string): Promise<string | null> {
  try {
    const { suiCompatCall } = await import("@/lib/terminal/sui-rpc-compat.server");
    const j = await suiCompatCall<{ data?: { type?: string } }>("sui_getObject", [id, { showType: true }]);
    return j.data?.type ?? null;
  } catch {
    return null;
  }
}

/**
 * Loads a presale and checks it is genuinely Blast's:
 * the on-chain type must be blast_presale::Presale<_, SUI>, and the package must
 * match BLAST_PRESALE_PACKAGE, or the sale must be listed by Blast's partner API.
 * Anyone can publish a look-alike module, so neither check alone is skipped.
 */
export async function loadVerifiedPresale(id: string): Promise<{ ok: true; sale: PresaleInfo } | { ok: false; error: string }> {
  const type = await getObjectType(id);
  if (!type) return { ok: false, error: "No presale found at that ID on Sui mainnet." };
  const parts = parsePresaleType(type);
  if (!parts) return { ok: false, error: "That object isn't a Blast.fun presale." };
  if (parts.quoteType.replace(/^0x0*2::/, "0x2::") !== "0x2::sui::SUI") return { ok: false, error: "Only SUI-quoted presales are supported here." };

  const { getBlastPresales } = await import("@/lib/blast/blast.server");
  const feed = await getBlastPresales();
  const listed = feed.ok ? feed.presales.find((p) => p.id.toLowerCase() === id || ("0x" + p.id.replace(/^0x/, "").padStart(64, "0")).toLowerCase() === id) : undefined;
  const pinned = process.env["BLAST_PRESALE_PACKAGE"]?.toLowerCase();
  const pkgOk = pinned ? ("0x" + parts.pkg.replace(/^0x/, "").padStart(64, "0")) === ("0x" + pinned.replace(/^0x/, "").padStart(64, "0")) : false;
  if (!listed && !pkgOk) {
    return {
      ok: false,
      error: feed.ok || pinned
        ? "This sale isn't listed by Blast.fun, so OURBLAST won't commit to it."
        : "Presale buys turn on once the Blast.fun partner key is added. Until then, join sales on blast.fun.",
    };
  }
  return {
    ok: true,
    sale: {
      id,
      pkg: parts.pkg,
      memeType: parts.memeType,
      symbol: listed?.symbol ?? parts.memeType.split("::").at(-1) ?? "TOKEN",
      name: listed?.name ?? null,
      status: listed?.status ?? null,
      raised: listed?.raised ?? null,
      target: listed?.target ?? null,
      endsAtMs: listed?.endsAtMs ?? null,
      url: `https://blast.fun/presale/${id}`,
    },
  };
}

export function presaleCard(s: PresaleInfo): string {
  const ends = s.endsAtMs ? new Date(s.endsAtMs).toUTCString().replace(" GMT", " UTC") : null;
  return [
    `🚀 Blast presale — $${s.symbol}${s.name ? ` (${s.name})` : ""}`,
    `Presale: ${s.id}`,
    `Token: ${s.memeType}`,
    s.status ? `Status: ${s.status}` : null,
    s.raised || s.target ? `Raised: ${s.raised ?? "?"} / ${s.target ?? "?"} SUI` : null,
    ends ? `Ends: ${ends}` : null,
    "",
    "Rules (set on-chain, can't change): one price for everyone; refund if the target is missed; extra over a hard cap is returned.",
    s.url,
  ].filter((l) => l !== null).join("\n");
}

/** Re-verifies the sale, then commits from the user's OurBank wallet. Only reports success with a digest. */
export async function commitPresaleForHandle(handle: string, id: string, amount: string): Promise<string> {
  const v = await loadVerifiedPresale(id);
  if (!v.ok) return `Not sent. ${v.error}`;
  const { findBankWallet, commitPresaleFromBankWallet } = await import("@/lib/terminal/bank-wallet.server");
  const wallet = await findBankWallet(handle);
  if (!wallet) return "Not sent. No OurBank wallet found for your linked X account.";
  const r = await commitPresaleFromBankWallet(wallet, { pkg: v.sale.pkg, presaleId: id, memeType: v.sale.memeType, amount: suiToMist(amount) });
  if (!r.ok) return `Commit failed — nothing was committed. ${r.error}`;
  return `✅ Committed ${amount} SUI to the $${v.sale.symbol} presale.\nAny amount over a hard cap was returned to your wallet. Claim tokens (or a refund) on blast.fun after the sale ends.\nhttps://suiscan.xyz/mainnet/tx/${r.digest}`;
}

export { SUI_TYPE };
