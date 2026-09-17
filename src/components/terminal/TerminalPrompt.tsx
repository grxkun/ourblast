import React, { useState, useRef, useEffect } from "react";

interface TerminalPromptProps {
  onCommand: (cmd: string) => void;
  disabled?: boolean;
}

export function TerminalPrompt({ onCommand, disabled }: TerminalPromptProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onCommand(input.trim());
      setInput("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2 group">
      <span className="text-blast font-mono font-bold select-none">$</span>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={disabled}
        className="flex-1 bg-transparent border-none outline-none font-mono text-sm text-foreground caret-cyber"
        autoFocus
        placeholder={disabled ? "Processing..." : "Enter command..."}
      />
    </form>
  );
}
