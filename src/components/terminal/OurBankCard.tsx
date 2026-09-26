import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TradeWalletPanel } from "./TradeWalletPanel";
import { useServerFn } from "@tanstack/react-start";
import { Landmark, AlertTriangle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBlast } from "@/components/blast/session";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelTransfer,
  confirmTransfer,
  exportBankWalletKey,
  getMyBankWallet,
  importBankWallet,
  listMyTransfers,
  resetBankWallet,
  runBankCommand,
  withdrawBankWallet,
  prepareTransfer,
  transferCoinChoices,
} from "@/lib/terminal/bank.functions";
import { describeRecipient } from "@/lib/terminal/bank";

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Awaiting your approval",
  WAITING_RECIPIENT: "Recipient must link a wallet",
  SUBMITTED: "Checking on chain…",
  CONFIRMED: "Sent",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

/** OurBank: tweet "@ourblastbot send 25 SUI to @alice", then approve it here with your own wallet. */
export function OurBankCard() {
  const { userId, ready, signAndExecute } = useBlast();
  const queryClient = useQueryClient();
  const key = ["bank-transfers", userId];

  const list = useServerFn(listMyTransfers);
  const transfers = useQuery({
    queryKey: key,
    queryFn: () => list(),
    enabled: ready && Boolean(userId),
    // Live updates do the real work; this is only a safety net.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // A tweeted request shows up here the instant the bot saves it.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`ourbank-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bank_transfers", filter: `sender_user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["bank-transfers", userId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const prepare = useServerFn(prepareTransfer);
  const confirm = useServerFn(confirmTransfer);
  const cancel = useServerFn(cancelTransfer);
  const choices = useServerFn(transferCoinChoices);
  const [picking, setPicking] = useState<{ id: string; coins: { coinType: string; symbol: string }[] } | null>(null);

  const approve = useMutation({
    mutationFn: async ({ id, coinType }: { id: string; coinType?: string }) => {
      const plan = await prepare({ data: { id, coinType } });
      const { digest } = await signAndExecute(async (tx) => {
        const { coinWithBalance } = await import("@mysten/sui/transactions");
        const coin = coinWithBalance({ type: plan.coinType, balance: BigInt(plan.amountAtomic) });
        tx.transferObjects([coin], tx.pure.address(plan.recipient));
      });
      return confirm({ data: { id, digest } });
    },
    onSuccess: (result) => {
      setPicking(null);
      if (result.status === "CONFIRMED") toast.success("Transfer confirmed on chain.");
      else toast(result.message ?? "Submitted — still confirming.");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Transfer failed.");
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const onApprove = async (row: { id: string; coin_type: string | null }) => {
    if (row.coin_type) return approve.mutate({ id: row.id });
    try {
      const coins = await choices({ data: { id: row.id } });
      if (coins.length === 1) return approve.mutate({ id: row.id, coinType: coins[0]!.coinType });
      setPicking({ id: row.id, coins });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onCancel = async (id: string) => {
    try {
      await cancel({ data: { id } });
      void queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const rows = transfers.data ?? [];

  return (
    <section id="ourbank" className="border border-border bg-card p-4">
      <h2 className="font-display text-lg uppercase">
        <Landmark className="mr-2 inline size-4" />OurBank
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Tweet <code className="text-foreground">@ourblastbot send 25 SUI to @friend</code> (or to a <code>name.sui</code> or 0x
        address). Any Sui coin works. Top up your OurBank wallet below and sends go out instantly; otherwise the request waits here for your wallet's approval.
      </p>

      {userId ? <BankWalletPanel userId={userId} /> : null}
      {userId ? <SwapPanel userId={userId} /> : null}
      {userId ? <TradeWalletPanel userId={userId} /> : null}

      {!userId ? <p className="mt-3 text-sm text-muted-foreground">Sign in with X and connect your wallet to use OurBank.</p> : null}
      {userId && transfers.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading transfers…</p> : null}
      {userId && transfers.data && rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No transfers yet.</p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const open = row.status === "PENDING_APPROVAL";
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border border-border p-3 text-sm">
              <div>
                <p className="font-display">
                  {row.amount_display} {row.symbol} → {describeRecipient(row.recipient_kind as "x", row.recipient_input)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABEL[row.status] ?? row.status}
                  {row.recipient_address ? ` · ${row.recipient_address.slice(0, 8)}…${row.recipient_address.slice(-6)}` : ""}
                  {row.error ? ` · ${row.error}` : ""}
                </p>
                {row.tx_digest ? (
                  <a className="text-xs text-primary underline" href={`https://suiscan.xyz/mainnet/tx/${row.tx_digest}`} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                ) : null}
                {picking?.id === row.id ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {picking.coins.map((c) => (
                      <Button key={c.coinType} size="sm" variant="outline" onClick={() => approve.mutate({ id: row.id, coinType: c.coinType })}>
                        {c.symbol} · {c.coinType.slice(0, 10)}…
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                {open ? (
                  <Button size="sm" disabled={approve.isPending} onClick={() => void onApprove(row)}>
                    {approve.isPending && approve.variables?.id === row.id ? "Approving…" : "Approve"}
                  </Button>
                ) : null}
                {row.status === "SUBMITTED" && row.tx_digest ? (
                  <Button size="sm" variant="outline" onClick={() => confirm({ data: { id: row.id, digest: row.tx_digest! } }).then(() => queryClient.invalidateQueries({ queryKey: key }))}>
                    Re-check
                  </Button>
                ) : null}
                {open || row.status === "WAITING_RECIPIENT" ? (
                  <Button size="sm" variant="ghost" onClick={() => void onCancel(row.id)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BankWalletPanel({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const get = useServerFn(getMyBankWallet);
  const withdraw = useServerFn(withdrawBankWallet);
  const doImport = useServerFn(importBankWallet);
  const doReset = useServerFn(resetBankWallet);
  const doExport = useServerFn(exportBankWalletKey);
  const wallet = useQuery({ queryKey: ["bank-wallet", userId], queryFn: () => get(), refetchInterval: 20_000 });
  const [showImport, setShowImport] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [confirmAction, setConfirmAction] = useState<"import" | "reset" | null>(null);
  const [showBackup, setShowBackup] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [keyCountdown, setKeyCountdown] = useState(0);

  const exportKey = useMutation({
    mutationFn: () => doExport(),
    onSuccess: (data) => { setRevealedKey(data.secretKey); setKeyCountdown(60); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-hide the revealed key and clear the clipboard after the countdown.
  useEffect(() => {
    if (!revealedKey) return;
    if (keyCountdown <= 0) {
      setRevealedKey(null);
      setAcknowledged(false);
      void navigator.clipboard.writeText("").catch(() => {});
      return;
    }
    const t = setTimeout(() => setKeyCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [revealedKey, keyCountdown]);

  const backupInstructions = [
    "OURBLAST WALLET BACKUP",
    "",
    `Wallet address: ${wallet.data?.address ?? ""}`,
    "",
    "1. Withdraw all funds from this OurBank wallet to your connected Sui wallet.",
    "2. Save the private key below in a secure location (password manager, offline note).",
    "3. NEVER share this key with anyone, not even OurBlast support.",
    "4. With this key you have full custody of your funds. If you lose it, no one can recover it.",
    "5. To restore: Import wallet and paste this key in the OurBank card.",
    "",
    revealedKey ? `Private key: ${revealedKey}` : "Private key: [Reveal it in the backup dialog first]",
  ].join("\n");

  const out = useMutation({
    mutationFn: (coinType: string) => withdraw({ data: { coinType } }),
    onSuccess: () => {
      toast.success("Withdrawn to your connected wallet.");
      void queryClient.invalidateQueries({ queryKey: ["bank-wallet", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const imp = useMutation({
    mutationFn: (privateKey: string) => doImport({ data: { privateKey } }),
    onSuccess: () => {
      toast.success("Wallet imported.");
      setShowImport(false);
      setKeyInput("");
      setConfirmAction(null);
      void queryClient.invalidateQueries({ queryKey: ["bank-wallet", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: () => doReset(),
    onSuccess: () => {
      toast.success("New wallet generated.");
      setConfirmAction(null);
      void queryClient.invalidateQueries({ queryKey: ["bank-wallet", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const w = wallet.data;
  if (!w) return null;
  if (!w.linked) return <p className="mt-3 text-sm text-muted-foreground">Sign in with X to get an OurBank wallet for instant sends.</p>;

  const hasFunds = w.balances.length > 0;
  const isImport = confirmAction === "import";

  return (
    <div className="mt-3 border border-primary/40 p-3 text-sm">
      <p className="font-display uppercase">Your OurBank wallet · instant sends</p>
      {w.signingBackend === "turnkey" ? (
        <p className="mt-1 inline-flex items-center gap-1 border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
          <ShieldCheck className="size-3.5" /> Turnkey enclave protected — key never stored here
        </p>
      ) : null}
      <p className="mt-1 break-all text-xs text-muted-foreground">
        Send coins (plus a little SUI for fees) to <span className="text-foreground">{w.address}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(w.address); toast("Address copied"); }}>
          Copy address
        </Button>
        {w.signingBackend === "turnkey" ? null : (
          <Button size="sm" variant="outline" onClick={() => { setShowBackup(true); setRevealedKey(null); setAcknowledged(false); }}>
            Backup
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setShowImport((v) => !v)}>
          {showImport ? "Cancel" : "Import wallet"}
        </Button>
        <Button size="sm" variant="ghost" disabled={reset.isPending} onClick={() => setConfirmAction("reset")}>
          {reset.isPending ? "Generating…" : "New wallet"}
        </Button>
      </div>

      {showImport ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Paste a Sui private key to use your own wallet. Your current OurBank wallet must be empty (withdraw first), since the old key is discarded.
          </p>
          <input
            type="password"
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
            placeholder="Suiprivkey1… or base64 hex"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            autoComplete="off"
          />
          <Button size="sm" disabled={imp.isPending || !keyInput.trim()} onClick={() => setConfirmAction("import")}>
            {imp.isPending ? "Importing…" : "Import this wallet"}
          </Button>
        </div>
      ) : null}

      <ul className="mt-2 space-y-1">
        {w.balances.length === 0 ? <li className="text-xs text-muted-foreground">Empty — tweets use the approval flow until you top up.</li> : null}
        {w.balances.map((b) => (
          <li key={b.coinType} className="flex items-center justify-between gap-2">
            <span>{b.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {b.symbol}</span>
            <Button size="sm" variant="ghost" disabled={out.isPending} onClick={() => out.mutate(b.coinType)}>Withdraw</Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {w.signingBackend === "turnkey"
          ? "This wallet's key lives inside Turnkey's hardware enclave — OurBlast never sees or stores it. Only keep what you plan to send."
          : "OurBlast holds this wallet's key for you. Import your own key if you'd rather keep custody. Only keep what you plan to send."}
      </p>

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              {isImport ? "Replace wallet with your key?" : "Generate a new wallet?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This permanently replaces your current OurBank wallet
                  {" "}<code className="text-foreground">{w.address.slice(0, 8)}…{w.address.slice(-6)}</code>.
                  The old key is discarded and can never be recovered.
                </p>
                {hasFunds ? (
                  <p className="font-medium text-destructive">
                    Your wallet still holds funds. Withdraw everything first — replacing now would lose them permanently.
                  </p>
                ) : (
                  <p className="text-muted-foreground">Your wallet is empty, so no funds will be lost.</p>
                )}
                {!hasFunds && !isImport && (
                  <p className="text-muted-foreground">
                    Back up this wallet's key first?{" "}
                    <button type="button" className="underline text-primary" onClick={() => { setConfirmAction(null); setShowBackup(true); setRevealedKey(null); setAcknowledged(false); }}>
                      Open backup
                    </button>
                  </p>
                )}
                {isImport ? (
                  <p className="text-muted-foreground">
                    Save the private key you're importing somewhere safe. If you lose it, neither you nor OurBlast can recover the funds.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    The new wallet's key will live in Turnkey's secure enclave. Only keep what you plan to send.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={hasFunds || (isImport ? imp.isPending : reset.isPending) || (isImport && !keyInput.trim())}
              onClick={() => {
                if (isImport) imp.mutate(keyInput);
                else reset.mutate();
              }}
            >
              {hasFunds
                ? "Withdraw first"
                : isImport
                  ? (imp.isPending ? "Importing…" : "Yes, replace my wallet")
                  : (reset.isPending ? "Generating…" : "Yes, generate new wallet")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBackup} onOpenChange={(open) => { if (!open) { setShowBackup(false); setRevealedKey(null); setAcknowledged(false); } }}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              Back up your wallet
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Wallet address: <code className="text-foreground">{w.address.slice(0, 10)}…{w.address.slice(-8)}</code>
                </p>
                <div className="rounded border border-border p-2 text-xs">
                  <p className="font-medium text-foreground">Before replacing this wallet:</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-4">
                    <li>Withdraw all funds to your connected Sui wallet.</li>
                    <li>Reveal and copy the private key below.</li>
                    <li>Store it somewhere secure — password manager or offline note.</li>
                    <li>Never share it with anyone, not even OurBlast support.</li>
                    <li>To restore: use "Import wallet" and paste this key.</li>
                  </ol>
                </div>
                {hasFunds && (
                  <p className="font-medium text-destructive">
                    Your wallet still holds funds. Withdraw first before replacing.
                  </p>
                )}
                {revealedKey ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-destructive">
                      ⚠ This is your private key. Anyone with it controls your funds. Copy it now and never share it.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Auto-hides and clears clipboard in {keyCountdown}s
                    </p>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        className="w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono"
                        value={revealedKey}
                        onFocus={(e) => e.target.select()}
                      />
                      <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(revealedKey); toast.success("Private key copied"); setKeyCountdown(60); }}>
                        Copy key
                      </Button>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(backupInstructions); toast.success("Instructions copied"); setKeyCountdown(60); }}>
                      Copy all backup instructions
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>I understand this key gives full control of my funds, and I will store it securely.</span>
                    </label>
                    <Button
                      size="sm"
                      disabled={!acknowledged || exportKey.isPending}
                      onClick={() => exportKey.mutate()}
                    >
                      {exportKey.isPending ? "Decrypting…" : "Reveal private key"}
                    </Button>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const COIN_TYPE_RE = /^0x[0-9a-fA-F]{64}::[A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*$/;

/** Manual buy/sell: same engine as an X mention, run straight from the terminal. */
function SwapPanel({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const run = useServerFn(runBankCommand);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [coinType, setCoinType] = useState("");
  const [amount, setAmount] = useState("");
  const [lastReply, setLastReply] = useState<string | null>(null);

  const swap = useMutation({
    mutationFn: async () => {
      const coin = coinType.trim();
      const amt = amount.trim();
      if (!COIN_TYPE_RE.test(coin)) throw new Error("Enter the full token address, like 0x…::blast::BLAST");
      if (side === "buy") {
        const sui = Number(amt);
        if (!Number.isFinite(sui) || sui <= 0) throw new Error("Enter how much SUI to spend, e.g. 0.5");
        return run({ data: { text: `buy ${coin} with ${sui} sui` } });
      }
      const isPct = amt.endsWith("%");
      const n = Number(isPct ? amt.slice(0, -1) : amt);
      if (!Number.isFinite(n) || n <= 0 || (isPct && n > 100)) {
        throw new Error("Enter how much to sell, e.g. 50% or 1000");
      }
      return run({ data: { text: `sell ${amt} ${coin}` } });
    },
    onSuccess: (result) => {
      setLastReply(result.reply);
      if (result.swapId) {
        toast("Trade ready — approve it in the Trade wallet list below.");
      } else if (/confirmed|done|bought|sold/i.test(result.reply)) {
        toast.success(result.reply);
      } else {
        toast(result.reply);
      }
      void queryClient.invalidateQueries({ queryKey: ["own-swaps", userId] });
      void queryClient.invalidateQueries({ queryKey: ["bank-wallet", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-3 border border-border p-3 text-sm">
      <p className="font-display uppercase">Swap · buy &amp; sell</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Trade any token right here — same engine as tweeting the bot. Uses your chosen trade wallet (OurBank = instant, your own wallet = you approve).
      </p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant={side === "buy" ? "default" : "outline"} onClick={() => setSide("buy")}>Buy</Button>
        <Button size="sm" variant={side === "sell" ? "default" : "outline"} onClick={() => setSide("sell")}>Sell</Button>
      </div>
      <div className="mt-2 space-y-2">
        <input
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono"
          placeholder="Token address, e.g. 0x577a…::blast::BLAST"
          value={coinType}
          onChange={(e) => setCoinType(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <input
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
          placeholder={side === "buy" ? "SUI to spend, e.g. 0.5" : "Amount to sell, e.g. 50% or 1000"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoComplete="off"
          inputMode="decimal"
        />
        <Button size="sm" disabled={swap.isPending || !coinType.trim() || !amount.trim()} onClick={() => swap.mutate()}>
          {swap.isPending ? "Working…" : side === "buy" ? "Buy now" : "Sell now"}
        </Button>
      </div>
      {lastReply ? <p className="mt-2 text-xs text-muted-foreground">{lastReply}</p> : null}
    </div>
  );
}
