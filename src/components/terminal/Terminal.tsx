import React, { useState, useRef, useEffect } from "react";
import { TerminalLine, type LineType } from "./TerminalLine";
import { TerminalPrompt } from "./TerminalPrompt";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBlast } from "@/components/blast/session";
import { formatNumber } from "@/lib/blast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  type: LineType;
  content: string;
}

export function Terminal() {
  const { userId, profile } = useBlast();
  const [history, setHistory] = useState<Message[]>([
    { id: "1", type: "system", content: "OURBLAST V1.0.4 - CONVERSATIONAL TERMINAL" },
    { id: "2", type: "system", content: "Connection established. Secure tunnel active." },
    { id: "3", type: "ai", content: "Greetings, Builder. How can I assist you with Blast Island today?" },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const vault = useQuery({
    queryKey: ["vault", "summary"],
    queryFn: async () => {
      const { data } = await supabase.from("vault_stats").select("*").maybeSingle();
      return data;
    },
  });

  const addLine = (type: LineType, content: string) => {
    setHistory((prev) => [...prev, { id: Math.random().toString(36), type, content }]);
  };

  const handleCommand = async (input: string) => {
    addLine("user", input);
    setIsProcessing(true);

    // Command Simulation / Processing
    setTimeout(() => {
      if (input.startsWith("/")) {
        const cmd = input.slice(1).toLowerCase();
        processCommand(cmd);
      } else {
        // AI Integration Point
        if (!userId) {
          addLine("error", "Transceiver authentication required. Connect wallet to access AI protocols.");
        } else {
          addLine("ai", `Accessing knowledge base for "${input}"... Protocol initialized.`);
        }
      }
      setIsProcessing(false);
    }, 600);
  };

  const processCommand = (cmd: string) => {
    switch (cmd) {
      case "help":
        addLine("system", "Available protocols: /points, /status, /vault, /clear");
        break;
      case "points":
        if (userId && profile) {
          addLine("ai", `Current balance: ${formatNumber(profile.points)} BLAST POINTS.`);
        } else {
          addLine("error", "Identity not verified. Cannot retrieve point balances.");
        }
        break;
      case "vault":
        addLine("ai", "Querying treasury... Total value locked: 124,500 SUI. Reward pool: 42,000 SUI.");
        break;
      case "status":
        addLine("system", "Network: SUI Mainnet | Latency: 38ms | Security: Level 5");
        break;
      case "clear":
        setHistory([]);
        break;
      default:
        addLine("error", "Unknown command: " + cmd + ". Type /help for protocol listing.");
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [history]);

  return (
    <div className="panel flex flex-col h-[65vh] bg-background/80 backdrop-blur-md relative overflow-hidden border-cyber/20">
      {/* Scanline Effect Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.05)_50%),linear-gradient(90deg,rgba(255,0,0,0.01),rgba(0,255,0,0.005),rgba(0,0,0,0.01))] bg-[length:100%_4px,3px_100%] z-10 opacity-40" />
      
      {/* Grid Noise Background */}
      <div className="absolute inset-0 pointer-events-none grid-noise opacity-5" />

      <div className="p-4 flex-1 flex flex-col relative z-20 overflow-hidden">
        <ScrollArea ref={scrollRef} className="flex-1 pr-4">
          <div className="space-y-1">
            {history.map((msg) => (
              <TerminalLine key={msg.id} type={msg.type} content={msg.content} animate />
            ))}
          </div>
        </ScrollArea>
        
        <TerminalPrompt onCommand={handleCommand} disabled={isProcessing} />
      </div>
    </div>
  );
}
