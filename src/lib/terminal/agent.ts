import { parseTerminalCommand } from "./commandParser";
import { executeTerminalIntent } from "./tools";
import type { TerminalAgentContext, TerminalToolResult } from "./types";

export interface TerminalAgentResponse {
  command: string;
  intent: ReturnType<typeof parseTerminalCommand>;
  result: TerminalToolResult;
}

/** Shared by the web terminal now and a future authenticated X mention transport. */
export async function runTerminalAgent(command: string, context: TerminalAgentContext): Promise<TerminalAgentResponse> {
  const intent = parseTerminalCommand(command);
  const result = await executeTerminalIntent(intent, context);
  return { command: intent.raw, intent, result };
}