// SPDX-License-Identifier: BUSL-1.1
import { findBankWallet, findBankWalletByUserId, sendFromBankWallet, SUI_TYPE } from "./bank-wallet.server";
import { SUI_OUT_GAS_KEEP, suiOutProblem } from "./suiOut";

type Out = { ok: boolean; message: string; link?: string };
type Wallet = NonNullable<Awaited<ReturnType<typeof findBankWallet>>>;

const EVM_REFUSED = "SUI → ETH/BNB isn't available right now (the bridge provider refuses that route). Bridge to SOL instead: bridge 10 sui to sol";

async function suiBalance(address: string): Promise<number> {
  const { bankBalances } = await import("./bank-wallet.server");
  const b = (await bankBalances(address)).find((x) => x.coinType === SUI_TYPE);
  return Number(b?.balance ?? 0n) / 1e9;
}

async function quoteDeposit(amountMist: bigint, refundTo: string, recipient: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const jwt = process.env["ONECLICK_JWT"];
  if (jwt) headers["authorization"] = `Bearer ${jwt}`;
  const res = await fetch("https://1click.chaindefuser.com/v0/quote", {
    method: "POST",
    headers,
    body: JSON.stringify({
      dry: false, swapType: "EXACT_INPUT", slippageTolerance: 300,
      originAsset: "nep141:sui.omft.near", depositType: "ORIGIN_CHAIN", amount: amountMist.toString(),
      destinationAsset: "nep141:sol.omft.near", recipient, recipientType: "DESTINATION_CHAIN",
      refundTo, refundType: "ORIGIN_CHAIN", deadline: new Date(Date.now() + 3_600_000).toISOString(),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; quote?: { depositAddress?: string; amountOutFormatted?: string } };
  if (!res.ok || !json.quote?.depositAddress) throw new Error(json.message ?? `quote failed (${res.status})`);
  return { deposit: json.quote.depositAddress, out: json.quote.amountOutFormatted ?? "?" };
}

async function run(wallet: Wallet | null, amountSui: number, target: "SOL" | "EVM", destination?: string): Promise<Out> {
  if (target === "EVM") return { ok: false, message: EVM_REFUSED };
  if (!wallet) return { ok: false, message: "No OurBank wallet yet." };
  let recipient = destination;
  if (!recipient) {
    const { ensureSolDepositAddress } = await import("./bank-sol.server");
    recipient = (await ensureSolDepositAddress(wallet.x_username)) ?? undefined;
  }
  if (!recipient) return { ok: false, message: "No Solana address to send to — add one: bridge 10 sui to sol <address>" };
  const problem = suiOutProblem(amountSui, await suiBalance(wallet.address));
  if (problem) return { ok: false, message: `Bridge failed, nothing was sent: ${problem}` };
  const mist = BigInt(Math.floor(amountSui * 1e9));
  let q: { deposit: string; out: string };
  try {
    q = await quoteDeposit(mist, wallet.address, recipient);
  } catch (e) {
    return { ok: false, message: `Bridge failed, nothing was sent: ${(e as Error).message}` };
  }
  const sent = await sendFromBankWallet(wallet, SUI_TYPE, mist, q.deposit);
  if (!sent.ok) return { ok: false, message: `Bridge failed, nothing was sent: ${sent.error}` };
  const short = `${recipient.slice(0, 4)}…${recipient.slice(-4)}`;
  return {
    ok: true,
    message: `Bridging ${amountSui} SUI → ≈${q.out} SOL to ${short} (~30s). ${SUI_OUT_GAS_KEEP} SUI stays for fees.`,
    link: `https://suiscan.xyz/mainnet/tx/${sent.digest}`,
  };
}

export async function bridgeSuiOutForUser(userId: string, amountSui: number, target: "SOL" | "EVM", destination?: string) {
  return run(await findBankWalletByUserId(userId), amountSui, target, destination);
}

export async function bridgeSuiOutForXHandle(handle: string, amountSui: number, target: "SOL" | "EVM", destination?: string): Promise<string> {
  const r = await run(await findBankWallet(handle), amountSui, target, destination);
  return `@${handle} ${r.message}${r.link ? ` ${r.link}` : ""}`.slice(0, 280);
}
