import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, History, ImagePlus, RotateCcw, Trash2, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Attachment, AttachmentPreview, AttachmentRemove, Attachments } from "@/components/ai-elements/attachments";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { PromptInput, PromptInputButton, PromptInputFooter, PromptInputHeader, type PromptInputMessage, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useBlast } from "@/components/blast/session";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { runTerminalAgent } from "@/lib/terminal/agent";
import type { LaunchConfiguration, TerminalEntry, TerminalIntentName, TerminalStatus } from "@/lib/terminal/types";

import { CommandSuggestions } from "./CommandSuggestions";
import { LaunchCard } from "./LaunchCard";
import { TerminalMessage } from "./TerminalMessage";
import { TransactionCard } from "./TransactionCard";

const SESSION_KEY = "ourblast-terminal-session-v1";
const makeId = () => crypto.randomUUID();

function sessionHistory(): TerminalEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "[]") as TerminalEntry[]; } catch { return []; }
}

export function Terminal() {
  const { userId, profile, connect, connecting } = useBlast();
  const queryClient = useQueryClient();
  const [anonymousHistory, setAnonymousHistory] = useState<TerminalEntry[]>(sessionHistory);
  const [draft, setDraft] = useState("");
  const [processing, setProcessing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [launchOverrides, setLaunchOverrides] = useState<Record<string, LaunchConfiguration>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const cloudHistory = useQuery({
    queryKey: ["terminal-history", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from("terminal_history").select("id, command, intent, response, status, result, created_at").order("created_at", { ascending: true }).limit(100);
      if (error) throw error;
      return (data ?? []).map((row): TerminalEntry => ({
        id: row.id, command: row.command, intent: row.intent as TerminalIntentName, createdAt: row.created_at,
        result: { tool: row.intent as TerminalIntentName, status: row.status as TerminalStatus, message: row.response, data: typeof row.result === "object" && row.result && !Array.isArray(row.result) ? row.result as Record<string, unknown> : undefined },
      }));
    },
  });

  const history = userId ? (cloudHistory.data ?? []) : anonymousHistory;

  useEffect(() => { if (!userId) sessionStorage.setItem(SESSION_KEY, JSON.stringify(anonymousHistory)); }, [anonymousHistory, userId]);
  useEffect(() => { if (!processing) inputRef.current?.focus(); }, [processing, history.length]);

  const saveEntry = useCallback(async (entry: TerminalEntry) => {
    if (!userId) { setAnonymousHistory((current) => [...current, entry].slice(-100)); return; }
    const { error } = await supabase.from("terminal_history").insert({ user_id: userId, command: entry.command, intent: entry.intent, response: entry.result.message, status: entry.result.status, result: entry.result.data ?? {} });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["terminal-history", userId] });
  }, [queryClient, userId]);

  const run = useCallback(async (command: string, image?: { url: string; filename?: string }) => {
    const clean = command.trim().slice(0, 500);
    if (!clean || processing) return;
    setProcessing(true);
    try {
      const response = await runTerminalAgent(clean, { walletConnected: Boolean(userId), walletAddress: profile?.wallet_address ?? null, source: "terminal" });
      if (response.result.launch && image) response.result.launch = { ...response.result.launch, image: image.url, ...(image.filename ? { imageName: image.filename } : {}) };
      const entry: TerminalEntry = { id: makeId(), command: response.command, intent: response.intent.name, result: response.result, createdAt: new Date().toISOString() };
      if (entry.result.launch) setLaunchOverrides((current) => ({ ...current, [entry.id]: entry.result.launch as LaunchConfiguration }));
      await saveEntry(entry);
    } catch (error) {
      toast.error("Terminal history was not saved", { description: error instanceof Error ? error.message : "Try again." });
    } finally { setProcessing(false); }
  }, [processing, profile?.wallet_address, saveEntry, userId]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const image = message.files.find((file) => file.mediaType?.startsWith("image/"));
    await run(message.text || (image ? "launch $TOKEN Token Name" : ""), image ? { url: image.url, ...(image.filename ? { filename: image.filename } : {}) } : undefined);
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

  return (
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
              return <TerminalMessage key={entry.id} entry={entry} onCopy={() => void navigator.clipboard.writeText(entry.command)} onRerun={() => void run(entry.command)}>{launch ? <LaunchCard launch={launch} editing={editingId === entry.id} onEdit={() => setEditingId((value) => value === entry.id ? null : entry.id)} onChange={(next) => setLaunchOverrides((current) => ({ ...current, [entry.id]: next }))} onGenerate={() => toast("Image generation is coming soon / not connected.")} onLaunch={() => { if (!userId) void connect(); else toast("Blast.fun deployment is coming soon / not connected."); }} /> : null}{["launchToken", "createToken", "buyToken", "sellToken"].includes(entry.intent) ? <TransactionCard status={entry.result.status} /> : null}</TerminalMessage>;
            })}
            {processing ? <div className="flex items-center gap-2 text-sm"><span className="terminal-status-dot" /><Shimmer>Mapping intent to an approved tool…</Shimmer></div> : null}
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
  );
}

function ComposerAttachments() {
  const { files, remove } = requireAttachments();
  if (!files.length) return null;
  return <Attachments variant="inline">{files.map((file) => <Attachment key={file.id} data={file} onRemove={() => remove(file.id)}><AttachmentPreview /><AttachmentRemove /></Attachment>)}</Attachments>;
}

function AttachmentButton() {
  const { openFileDialog } = requireAttachments();
  return <PromptInputButton type="button" tooltip="Attach token artwork" onClick={openFileDialog}><ImagePlus /></PromptInputButton>;
}

function requireAttachments() {
  // Kept in a helper so both controls consume the PromptInput's local attachment context.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return requirePromptAttachments();
}

import { usePromptInputAttachments as requirePromptAttachments } from "@/components/ai-elements/prompt-input";
