import React from "react";
import { motion } from "motion";
import { cn } from "@/lib/utils";

export type LineType = "user" | "system" | "ai" | "error" | "command";

interface TerminalLineProps {
  type: LineType;
  content: string;
  animate?: boolean;
}

export function TerminalLine({ type, content, animate = false }: TerminalLineProps) {
  const prefix = {
    user: "> ",
    system: "[SYS] ",
    ai: "[AI] ",
    error: "[ERR] ",
    command: "$ ",
  }[type];

  const colorClass = {
    user: "text-foreground",
    system: "text-muted-foreground",
    ai: "text-cyber shadow-[0_0_10px_rgba(34,211,238,0.2)]",
    error: "text-destructive",
    command: "text-blast font-bold",
  }[type];

  return (
    <div className={cn("font-mono text-sm leading-relaxed break-words py-0.5", colorClass)}>
      <span className="opacity-50 select-none mr-2">{prefix}</span>
      {animate && type === "ai" ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {content}
        </motion.span>
      ) : (
        <span>{content}</span>
      )}
    </div>
  );
}
