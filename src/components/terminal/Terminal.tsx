import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, History, ImagePlus, RotateCcw, Trash2, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Attachment, AttachmentPreview, AttachmentRemove, Attachments } from "@/components/ai-elements/attachments";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { PromptInput, PromptInputButton, PromptInputFooter, PromptInputHeader, type PromptInputMessage, PromptInputSubmit, PromptInputTextarea, PromptInputTools, usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useBlast } from "@/components/blast/session";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { runTerminalAgent } from "@/lib/terminal/agent";
import { chatCommand, interpretCommand } from "@/lib/terminal/nlu.functions";
import { runBankCommand } from "@/lib/terminal/bank.functions";
import { launchFromTerminal } from "@/lib/terminal/xLauncher.functions";
import { bridgeNow, bridgeSolNow, previewSolBridge } from "@/lib/terminal/evm-sweep.functions";
import { parseSolCommand } from "@/lib/terminal/solCommand";
import { parseSuiOutCommand } from "@/lib/terminal/suiOut";
import { bridgeSuiOut } from "@/lib/terminal/suiOut.functions";
import { parseFundWith } from "@/lib/terminal/fundedLaunch";
import { resolveFundedLaunchTerminal, stageFundedLaunchTerminal } from "@/lib/terminal/fundedLaunch.functions";
import { uploadTokenIcon } from "@/lib/terminal/tokenIcon.functions";
import { parseBankCommand, parseMultiSendCommand, parseSwapCommand } from "@/lib/terminal/bank";
import { useBankApprovals } from "./useBankApprovals";
import type { LaunchConfiguration, TerminalEntry, TerminalIntentName, TerminalStatus } from "@/lib/terminal/types";

import { CommandSuggestions } from "./CommandSuggestions";
import { LaunchCard } from "./LaunchCard";
import { TerminalMessage } from "./TerminalMessage";
import { TransactionCard } from "./TransactionCard";
import { BridgeTracker } from "./BridgeTracker";
import { LiveTxTracker } from "./LiveTxTracker";

const SESSION_KEY = "ourblast-terminal-session-v1";
const makeId = () => crypto.randomUUID();

function sessionHistory(): TerminalEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "[]") as TerminalEntry[]; } catch { return []; }
}

export function Terminal({ tryCommand }: { tryCommand?: { command: string; nonce: number } | undefined }) {
  const { userId, profile, connect, connecting } = useBlast();
  const queryClient = useQueryClient();
  const [anonymousHistory, setAnonymousHistory] = useState<TerminalEntry[]>(sessionHistory);
  const [draft, setDraft] = useState("");
  const [processing, setProcessing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [launchOverrides, setLaunchOverrides] = useState<Record<string, LaunchConfiguration>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const interpret = useServerFn(interpretCommand);
  const chat = useServerFn(chatCommand);
  const bankCommand = useServerFn(runBankCommand);
  const launchNow = useServerFn(launchFromTerminal);
  const bridge = useServerFn(bridgeNow);
  const bridgeSol = useServerFn(bridgeSolNow);
  const previewSol = useServerFn(previewSolBridge);
  const stageFunded = useServerFn(stageFundedLaunchTerminal);
  const bridgeOut = useServerFn(bridgeSuiOut);
  const uploadIcon = useServerFn(uploadTokenIcon);
  const resolveFunded = useServerFn(resolveFundedLaunchTerminal);
  const pendingFunded = useRef<string | null>(null);
  // SOL bridge waiting for "confirm" (10 min).
  const pendingSol = useRef<{ amountSol?: number | undefined; buyBlast: boolean; until: number } | null>(null);
  const [launching, setLaunching] = useState(false);
  const { approveSwap, approveTransfer } = useBankApprovals();

  /** LAUNCH in the terminal: the backend runs the same pipeline as an X launch. */
  const doLaunch = useCallback(async (launch: LaunchConfiguration) => {
    if (launching) return;
    setLaunching(true);
    const pending = toast.loading(`Launching $${launch.symbol} on ${launch.launchpad}…`);
    try {
      const outcome = await launchNow({ data: {
        symbol: launch.symbol,
        name: launch.name,
        description: launch.description ?? "",
        launchpad: launch.launchpad,
        iconUrl: launch.image ?? null,
        startingCapUsd: launch.perps?.startingCapUsd ?? null,
        // A named market makes this a leveraged position (e.g. NVDA 3L) instead
        // of a plain curve — same behaviour as launching from a post.
        underlying: launch.perps?.underlying ?? null,
        long: launch.perps?.long ?? true,
        leverageBps: launch.perps?.leverageBps ?? null,
        // The dev-buy amount is currency-denominated by pad: USDC on
        // Perpsplexity, SUI on the SUI-quoted pads (POPULAR, RIPT).
        devBuyUsdc: launch.devBuy > 0 && launch.launchpad === "perpsplexity" ? launch.devBuy : null,
        devBuySui: launch.devBuy > 0 && (launch.launchpad === "popular" || launch.launchpad === "ript" || launch.launchpad === "suipump") ? launch.devBuy : null,
        pairToken: launch.pairToken ?? null,
        feeWallet: launch.feePayout?.mode === "wallet" ? launch.feePayout.wallet : null,
        feeX: launch.feePayout?.mode === "x" ? launch.feePayout.xUsername : null,
      } });
      toast.dismiss(pending);
      if (outcome.status === "DEPLOYED") toast.success(`$${launch.symbol} is live.`, { description: outcome.tokenUrl ?? undefined });
      else toast.error(outcome.notice ?? "The launch did not go through.");
    } catch (error) {
      toast.dismiss(pending);
      toast.error(error instanceof Error ? error.message : "The launch did not go through.");
    } finally {
      setLaunching(false);
    }
  }, [launchNow, launching]);

  const cloudHistory = useQuery({
    queryKey: ["terminal-history", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from("terminal_history").select("id, command, intent, response, status, result, created_at").order("created_at", { ascending: true }).limit(100);
      if (error) throw error;
      return (data ?? []).map((row): TerminalEntry => {
        const saved = typeof row.result === "object" && row.result && !Array.isArray(row.result) ? row.result as Record<string, unknown> : {};
        const launch = typeof saved["launch"] === "object" && saved["launch"] ? saved["launch"] as LaunchConfiguration : undefined;
        const storedData = typeof saved["data"] === "object" && saved["data"] && !Array.isArray(saved["data"]) ? saved["data"] as Record<string, unknown> : undefined;
        return {
          id: row.id, command: row.command, intent: row.intent as TerminalIntentName, createdAt: row.created_at,
          result: { tool: row.intent as TerminalIntentName, status: row.status as TerminalStatus, message: row.response, ...(storedData ? { data: storedData } : {}), ...(launch ? { launch } : {}) },
        };
      });
    },
  });

  const history = userId ? (cloudHistory.data ?? []) : anonymousHistory;

  useEffect(() => { if (!userId) sessionStorage.setItem(SESSION_KEY, JSON.stringify(anonymousHistory)); }, [anonymousHistory, userId]);
  useEffect(() => { if (!processing) inputRef.current?.focus(); }, [processing, history.length]);

  const saveEntry = useCallback(async (entry: TerminalEntry) => {
    if (!userId) { setAnonymousHistory((current) => [...current, entry].slice(-100)); return; }
    // Show the answer immediately; the cloud copy syncs in the background.
    queryClient.setQueryData<TerminalEntry[]>(["terminal-history", userId], (old) => [...(old ?? []), entry]);
    const launch = entry.result.launch ? { ...entry.result.launch, image: null, imageName: undefined } : undefined;
    const result = { ...(entry.result.data ? { data: entry.result.data } : {}), ...(launch ? { launch } : {}) };
    void supabase.from("terminal_history").insert({ id: entry.id, user_id: userId, command: entry.command, intent: entry.intent, response: entry.result.message, status: entry.result.status, result: result as Json })
      .then(({ error }) => { if (error) toast.error("Terminal history was not saved", { description: error.message }); });
  }, [queryClient, userId]);

  const run = useCallback(async (command: string, image?: { url: string; filename?: string }) => {
    const clean = command.trim().slice(0, 500);
    if (!clean || processing) return;
    setProcessing(true);
    setPending(clean);
    try {
      const context = { walletConnected: Boolean(userId), walletAddress: profile?.wallet_address ?? null, source: "terminal" as const };
      // Send / buy / sell (and "1"/"2" answers to a which-token question) run the same
      // OurBank logic as an X mention, with the wallet the user picked.
      // "bridge 0.03 sol" / "buy blast with 0.03 sol": move only that SOL to Sui → $BLAST.
      if (/^\s*(?:bridge|sol)\s+status\s*$/i.test(clean)) {
        await saveEntry({ id: makeId(), command: clean, intent: "getWallet", result: { tool: "getWallet", status: userId ? "READY" : "NOT_CONNECTED", message: userId ? "Latest SOL bridge:" : "Sign in first.", data: userId ? { bridgeTrack: "latest" } : {} }, createdAt: new Date().toISOString() });
        return;
      }
      // "launch $MOON on suipump with 0.1 sol|eth|bnb": review, then bridge → launch.
      if (pendingFunded.current && /^\s*(?:confirm|yes|confirm launch|cancel|no|cancel launch)\s*$/i.test(clean)) {
        const id = pendingFunded.current;
        pendingFunded.current = null;
        const out = await resolveFunded({ data: { id, confirm: !/cancel|no/i.test(clean) } }).catch((e: Error) => ({ ok: false, message: e.message, link: undefined }));
        const link = "link" in out && out.link ? `\n${out.link}` : "";
        await saveEntry({ id: makeId(), command: clean, intent: "launchToken", result: { tool: "launchToken", status: out.ok ? (/cancel/i.test(clean) ? "READY" : "SUBMITTING") : "FAILED", message: `${out.message}${link}`, data: out.ok && !/cancel/i.test(clean) ? { txTrack: { kind: "launch", since: new Date(Date.now() - 900_000).toISOString() } } : {} }, createdAt: new Date().toISOString() });
        return;
      }
      if (parseFundWith(clean) && /^\s*(?:launch|deploy|create|mint)\b/i.test(clean)) {
        if (!userId) {
          await saveEntry({ id: makeId(), command: clean, intent: "launchToken", result: { tool: "launchToken", status: "NOT_CONNECTED", message: "Sign in first to launch with SOL, ETH or BNB." }, createdAt: new Date().toISOString() });
          return;
        }
        const iconUrl = image?.url.startsWith("https://") ? image.url : null;
        const review = await stageFunded({ data: { text: clean, iconUrl } }).catch((e: Error) => ({ ok: false, message: e.message, id: undefined }));
        if (review) {
          if (!review.ok || !review.id) {
            await saveEntry({ id: makeId(), command: clean, intent: "launchToken", result: { tool: "launchToken", status: "FAILED", message: review.message }, createdAt: new Date().toISOString() });
            return;
          }
          const out = await resolveFunded({ data: { id: review.id, confirm: true } }).catch((e: Error) => ({ ok: false, message: e.message, link: undefined }));
          const link = "link" in out && out.link ? `\n${out.link}` : "";
          await saveEntry({ id: makeId(), command: clean, intent: "launchToken", result: { tool: "launchToken", status: out.ok ? "SUBMITTING" : "FAILED", message: `${out.message}${link}`, data: out.ok ? { txTrack: { kind: "launch", since: new Date(Date.now() - 120_000).toISOString() } } : {} }, createdAt: new Date().toISOString() });
          return;
        }
      }
      const outCmd = parseSuiOutCommand(clean);
      if (outCmd) {
        if (!userId) {
          await saveEntry({ id: makeId(), command: clean, intent: "getWallet", result: { tool: "getWallet", status: "NOT_CONNECTED", message: "Sign in first to bridge from your OurBank Sui wallet." }, createdAt: new Date().toISOString() });
          return;
        }
        const outStarted = new Date().toISOString();
        const out = await bridgeOut({ data: outCmd }).catch((e: Error) => ({ ok: false, message: e.message, link: undefined }));
        const link = "link" in out && out.link ? `\n${out.link}` : "";
        await saveEntry({ id: makeId(), command: clean, intent: "getWallet", result: { tool: "getWallet", status: out.ok ? "SUBMITTING" : "FAILED", message: `${out.message}${link}`, data: out.ok && outCmd.target !== "SOL" ? { txTrack: { kind: "suiout", since: outStarted } } : {} }, createdAt: new Date().toISOString() });
        void queryClient.invalidateQueries({ queryKey: ["bank-wallet", userId] });
        return;
      }
      const solCmd = parseSolCommand(clean);
      if (solCmd) {
        if (!userId) {
          await saveEntry({ id: makeId(), command: clean, intent: "getWallet", result: { tool: "getWallet", status: "NOT_CONNECTED", message: "Sign in first to use your OurBank Solana address." }, createdAt: new Date().toISOString() });
          return;
        }
        const startedAt = new Date().toISOString();
        const out = await bridgeSol({ data: { amountSol: solCmd.amountSol, buyBlast: solCmd.buyBlast === true } }).catch((e: Error) => ({ ok: false, message: e.message }));
        await saveEntry({ id: makeId(), command: clean, intent: "getWallet", result: { tool: "getWallet", status: out.ok ? "SUBMITTING" : "FAILED", message: out.ok ? `${out.message}\nLive status below. Type "bridge status" anytime to check again.` : out.message, data: out.ok ? { bridgeTrack: startedAt } : {} }, createdAt: new Date().toISOString() });
        void queryClient.invalidateQueries({ queryKey: ["bank-wallet", userId] });
        return;
      }
      if (/^\s*(?:confirm|yes|confirm bridge|cancel|no|cancel bridge)\s*$/i.test(clean) && pendingSol.current) {
        const p = pendingSol.current;
        pendingSol.current = null;
        if (/cancel|no/i.test(clean) || Date.now() > p.until) {
          await saveEntry({ id: makeId(), command: clean, intent: "getWallet", result: { tool: "getWallet", status: "READY", message: Date.now() > p.until && !/cancel|no/i.test(clean) ? "That bridge request expired. Type the command again." : "SOL bridge cancelled. Nothing moved." }, createdAt: new Date().toISOString() });
          return;
        }
        const startedAt = new Date().toISOString();
        const out = await bridgeSol({ data: { amountSol: p.amountSol, buyBlast: p.buyBlast } }).catch((e: Error) => ({ ok: false, message: e.message }));
        await saveEntry({ id: makeId(), command: clean, intent: "getWallet", result: { tool: "getWallet", status: out.ok ? "SUBMITTING" : "FAILED", message: out.ok ? `${out.message}\nLive status below. Type "bridge status" anytime to check again.` : out.message, data: out.ok ? { bridgeTrack: startedAt } : {} }, createdAt: new Date().toISOString() });
        void queryClient.invalidateQueries({ queryKey: ["bank-wallet", userId] });
        return;
      }
      // "bridge" / "sweep": move ETH/USDC on the OurBank EVM address to Sui now (auto-buys $BLAST).
      if (/^\s*(?:bridge|sweep)(?:\s+(?:now|eth|usdc|base|arbitrum|arb|robinhood|to\s+sui|to\s+blast))*\s*$/i.test(clean)) {
        if (!userId) {
          await saveEntry({ id: makeId(), command: clean, intent: "getWallet", result: { tool: "getWallet", status: "NOT_CONNECTED", message: "Sign in first to bridge from your OurBank EVM address." }, createdAt: new Date().toISOString() });
          return;
        }
        const evmStarted = new Date().toISOString();
        const out = await bridge();
        const lines = out.lines.map((l) => `${l.chain} ${l.amount} ${l.token}: ${l.status}${l.txHash ? ` ${l.txHash}` : ""}${l.error ? ` (${l.error})` : ""}`);
        const failed = !out.ok || out.lines.some((l) => l.status === "failed");
        await saveEntry({ id: makeId(), command: clean, intent: "getWallet", result: { tool: "getWallet", status: failed ? "FAILED" : out.lines.length ? "SUBMITTING" : "READY", message: [out.message, ...lines].join("\n"), data: out.lines.length ? { txTrack: { kind: "evm", since: evmStarted } } : {} }, createdAt: new Date().toISOString() });
        void queryClient.invalidateQueries({ queryKey: ["bank-wallet", userId] });
        return;
      }
      const swap = parseSwapCommand(clean);
      const isBank = Boolean(userId) && (swap || parseBankCommand(clean) || parseMultiSendCommand(clean) || /^\s*#?[1-4]\s*$/.test(clean) || /^\s*(buy|sell|swap)\b/i.test(clean) || /\bfees?\b/i.test(clean));
      if (isBank) {
        const out = await bankCommand({ data: { text: clean } });
        let message = out.reply;
        let status: TerminalStatus = /✅/.test(message) ? "CONFIRMED" : /not done|failed|couldn't|doesn't|no /i.test(message) ? "FAILED" : "READY";
        const signed = out.swapId ? await approveSwap(out.swapId).catch((e: Error) => ({ status: "FAILED" as const, message: e.message, digest: null }))
          : out.transferId ? await approveTransfer(out.transferId).catch((e: Error) => ({ status: "FAILED" as const, message: e.message, digest: null }))
          : null;
        if (signed) {
          status = signed.status === "CONFIRMED" ? "CONFIRMED" : signed.status === "FAILED" ? "FAILED" : "SUBMITTING";
          message = signed.status === "CONFIRMED"
            ? `Done ✅ https://suiscan.xyz/mainnet/tx/${signed.digest}`
            : `${signed.message ?? "Submitted — still confirming."}${signed.status === "FAILED" ? " You can retry from Trade wallet in OurBank below." : ""}`;
        }
        const intent: TerminalIntentName = swap ? (swap.side === "buy" ? "buyToken" : "sellToken") : "getWallet";
        await saveEntry({ id: makeId(), command: clean, intent, result: { tool: intent, status, message }, createdAt: new Date().toISOString() });
        await queryClient.invalidateQueries({ queryKey: ["own-swaps", userId] });
        return;
      }
      let response = await runTerminalAgent(clean, context);
      // Anything the rules cannot read gets rewritten into a canonical command and re-parsed.
      if (response.intent.name === "unknown") {
        const { command: rewritten } = await interpret({ data: { text: clean } });
        if (rewritten) {
          const retry = await runTerminalAgent(rewritten, context);
          if (retry.intent.name !== "unknown") response = { ...retry, command: clean };
        }
      }
      // Still not a command? Chat back in character instead of the dead-end fallback line.
      if (response.intent.name === "unknown") {
        const { reply } = await chat({ data: { text: clean } });
        if (reply) response = { ...response, command: clean, result: { tool: "unknown", status: "READY", message: reply } };
      }
      if (response.result.launch && image) response.result.launch = { ...response.result.launch, image: image.url, ...(image.filename ? { imageName: image.filename } : {}) };
      const entry: TerminalEntry = { id: makeId(), command: response.command, intent: response.intent.name, result: response.result, createdAt: new Date().toISOString() };
      if (entry.result.launch) setLaunchOverrides((current) => ({ ...current, [entry.id]: entry.result.launch as LaunchConfiguration }));
      await saveEntry(entry);
    } catch (error) {
      toast.error("Terminal history was not saved", { description: error instanceof Error ? error.message : "Try again." });
    } finally { setProcessing(false); setPending(null); }
  }, [interpret, chat, processing, profile?.wallet_address, saveEntry, userId, bankCommand, approveSwap, approveTransfer, queryClient, bridge, bridgeSol, previewSol]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const image = message.files.find((file) => file.mediaType?.startsWith("image/"));
    let stableImage: { url: string; filename?: string } | undefined;
    if (image) {
      const blob = await fetch(image.url).then((response) => response.blob());
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image could not be read."));
        reader.onerror = () => reject(new Error("Image could not be read."));
        reader.readAsDataURL(blob);
      });
      // Host the picture so launches get a short public URL for on-chain metadata.
      const hosted = userId ? await uploadIcon({ data: { dataUrl: url } }).catch(() => null) : null;
      if (userId && !hosted) toast.error("Couldn't save the picture — the launch would use the default icon.");
      stableImage = { url: hosted?.url ?? url, ...(image.filename ? { filename: image.filename } : {}) };
    }
    await run(message.text || (stableImage ? "launch $TOKEN Token Name" : ""), stableImage);
    setDraft("");
  };

  const clearHistory = async () => {
    if (!userId) { setAnonymousHistory([]); sessionStorage.removeItem(SESSION_KEY); return; }
    const { error } = await supabase.from("terminal_history").delete().eq("user_id", userId);
    if (error) return void toast.error("History could not be cleared");
    setLaunchOverrides({});
    await queryClient.invalidateQueries({ queryKey: ["terminal-history", userId] });
  };

  const recent = useMemo(() => [...history].reverse().slice(0, 8), [history]);

  // A launch call answered on X links here with the parsed details; rebuild the command so the
  // caller only has to press send.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || typeof window === "undefined") return;
    prefilled.current = true;
    const params = new URLSearchParams(window.location.search);
    const symbol = (params.get("symbol") ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
    if (!symbol) return;
    const parts = [`launch $${symbol}`];
    const name = (params.get("name") ?? "").trim().slice(0, 64);
    if (name) parts.push(name);
    const pad = params.get("pad");
    if (pad) parts.push(`on ${pad}`);
    const pair = params.get("pair");
    if (pair) parts.push(`paired with $${pair.replace(/^\$/, "")}`);
    const lp = params.get("lp");
    if (lp) parts.push(`with ${lp} liquidity`);
    const devBuy = params.get("devbuy");
    if (devBuy && Number(devBuy) > 0) parts.push(`dev buy ${devBuy}`);
    const supply = params.get("supply");
    if (supply) parts.push(`supply ${supply}`);
    const feeWallet = params.get("feewallet");
    const feeX = params.get("feex");
    if (feeWallet) parts.push(`fee to ${feeWallet}`);
    else if (feeX) parts.push(`fee to @${feeX.replace(/^@/, "")}`);
    setDraft(parts.join(" "));
  }, []);

  const lastTry = useRef(0);
  useEffect(() => {
    if (tryCommand && tryCommand.nonce !== lastTry.current) {
      lastTry.current = tryCommand.nonce;
      void run(tryCommand.command);
    }
  }, [tryCommand, run]);

  return (
    <TooltipProvider>
    <div className="terminal-shell">
      <aside className="terminal-recent">
        <div className="flex items-center justify-between border-b border-border p-4"><span className="flex items-center gap-2 font-display text-lg uppercase"><History className="size-4" /> Recent</span><Button type="button" variant="ghost" size="icon-sm" aria-label="Clear terminal history" onClick={() => void clearHistory()} disabled={!history.length}><Trash2 /></Button></div>
        <div className="space-y-1 p-2">{recent.length ? recent.map((entry) => <div key={entry.id} className="group flex items-center gap-1"><Button type="button" variant="ghost" className="min-w-0 flex-1 justify-start overflow-hidden font-mono text-xs" onClick={() => setDraft(entry.command)}><span className="truncate">&gt; {entry.command}</span></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`Copy ${entry.command}`} onClick={() => void navigator.clipboard.writeText(entry.command)}><Copy /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`Run ${entry.command} again`} onClick={() => void run(entry.command)}><RotateCcw /></Button></div>) : <p className="p-3 text-xs text-muted-foreground">Commands sync here after you connect your wallet.</p>}</div>
      </aside>

      <section className="terminal-main">
        <Conversation className="min-h-0">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-8 px-4 py-8 sm:px-8">
            {!history.length && !cloudHistory.isLoading ? <div className="flex min-h-[24rem] flex-col items-center justify-center text-center"><div className="terminal-agent-mark mb-5">OB<span>_</span></div><p className="font-display text-3xl uppercase">What do you want to do on Sui?</p><p className="mt-2 max-w-md text-sm text-muted-foreground">Describe the action. The terminal maps it to an allowlisted tool and shows the exact state before anything touches your wallet.</p><div className="mt-6"><CommandSuggestions onSelect={setDraft} /></div></div> : null}
            {history.map((entry) => {
              const launch = launchOverrides[entry.id] ?? entry.result.launch;
              return <TerminalMessage key={entry.id} entry={entry} onCopy={() => void navigator.clipboard.writeText(entry.command)} onRerun={() => void run(entry.command)}>{launch ? <LaunchCard launch={launch} editing={editingId === entry.id} onEdit={() => setEditingId((value) => value === entry.id ? null : entry.id)} onChange={(next) => setLaunchOverrides((current) => ({ ...current, [entry.id]: next }))} onGenerate={() => toast("Image generation is coming soon / not connected.")} onLaunch={() => { if (!userId) { void connect(); return; } void doLaunch(launch); }} /> : null}{["launchToken", "createToken", "buyToken", "sellToken"].includes(entry.intent) ? <TransactionCard status={entry.result.status} /> : null}{typeof entry.result.data?.["bridgeTrack"] === "string" ? <BridgeTracker since={entry.result.data["bridgeTrack"] === "latest" ? undefined : entry.result.data["bridgeTrack"]} /> : null}{(() => { const t = entry.result.data?.["txTrack"] as { kind?: string; since?: string } | undefined; return t && (t.kind === "suiout" || t.kind === "launch" || t.kind === "evm") && t.since ? <LiveTxTracker kind={t.kind} since={t.since} /> : null; })()}</TerminalMessage>;
            })}
            {processing ? <div className="space-y-3">{pending ? <div className="ml-auto w-fit max-w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm">&gt; {pending}</div> : null}<div className="flex items-center gap-2 text-sm"><span className="terminal-status-dot" /><Shimmer>Working on it…</Shimmer></div></div> : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="terminal-composer-wrap">
          <PromptInput accept="image/*" maxFiles={1} maxFileSize={5_000_000} globalDrop onError={(error) => toast.error(error.message)} onSubmit={handleSubmit} className="terminal-composer">
            <PromptInputHeader><ComposerAttachments /></PromptInputHeader>
            <PromptInputTextarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask OURBLAST to launch, check, trade, or inspect…" className="min-h-20 font-mono" autoFocus />
            <PromptInputFooter>
              <PromptInputTools><AttachmentButton /><PromptInputButton type="button" tooltip="Generate token artwork" onClick={() => toast("Image generation is coming soon / not connected.")}><WandSparkles /></PromptInputButton></PromptInputTools>
              <PromptInputSubmit status={processing ? "submitted" : "ready"} disabled={processing || !draft.trim()} />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-[0.65rem] text-muted-foreground">No private keys. No server-side signing. Every future transaction requires your wallet confirmation.</p>
        </div>
      </section>
    </div>
    </TooltipProvider>
  );
}

function ComposerAttachments() {
  const { files, remove } = usePromptInputAttachments();
  if (!files.length) return null;
  return <Attachments variant="inline">{files.map((file) => <Attachment key={file.id} data={file} onRemove={() => remove(file.id)}><AttachmentPreview /><AttachmentRemove /></Attachment>)}</Attachments>;
}

function AttachmentButton() {
  const { openFileDialog } = usePromptInputAttachments();
  return <PromptInputButton type="button" tooltip="Attach token artwork" onClick={openFileDialog}><ImagePlus /></PromptInputButton>;
}
