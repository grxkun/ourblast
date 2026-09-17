import { Copy, RotateCcw, Wrench } from "lucide-react";

import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import type { TerminalEntry } from "@/lib/terminal/types";

export function TerminalMessage({ entry, onCopy, onRerun, children }: { entry: TerminalEntry; onCopy: () => void; onRerun: () => void; children?: React.ReactNode }) {
  const state = entry.result.status === "FAILED" ? "output-error" : "output-available";
  return (
    <div className="space-y-4">
      <Message from="user"><MessageContent className="group-[.is-user]:border group-[.is-user]:border-border group-[.is-user]:bg-muted group-[.is-user]:text-foreground"><span className="font-mono">&gt; {entry.command}</span></MessageContent><MessageActions className="justify-end"><MessageAction tooltip="Copy command" onClick={onCopy}><Copy /></MessageAction><MessageAction tooltip="Run again" onClick={onRerun}><RotateCcw /></MessageAction></MessageActions></Message>
      <Message from="assistant">
        <MessageContent className="w-full"><MessageResponse>{entry.result.message}</MessageResponse>{children}</MessageContent>
        <Tool defaultOpen={false} className="mt-2 max-w-xl rounded-none">
          <ToolHeader type={`tool-${entry.intent}`} state={state} title={entry.intent} />
          <ToolContent><ToolInput input={{ command: entry.command }} /><ToolOutput output={{ status: entry.result.status, ...entry.result.data }} errorText={entry.result.status === "FAILED" ? entry.result.message : undefined} /></ToolContent>
        </Tool>
      </Message>
    </div>
  );
}