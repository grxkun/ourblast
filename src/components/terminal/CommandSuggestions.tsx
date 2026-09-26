import { ChartNoAxesCombined, CircleDollarSign, Coins, Search, WalletCards, Zap } from "lucide-react";

import { Suggestion } from "@/components/ai-elements/suggestion";

const suggestions = [
  { icon: Zap, label: "Launch a token", command: "launch $DOG Sui Dog" },
  { icon: Search, label: "Check a token", command: "check $DOG" },
  { icon: ChartNoAxesCombined, label: "Claim fees", command: "claim my fees" },
  { icon: WalletCards, label: "View wallet", command: "wallet" },
  { icon: Coins, label: "Buy & burn", command: "buy and burn 1 SUI of $BLAST" },
  { icon: CircleDollarSign, label: "Buy $BLAST", command: "buy 0.1 SUI of $BLAST" },
] as const;

export function CommandSuggestions({ onSelect }: { onSelect: (command: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {suggestions.map(({ icon: Icon, label, command }) => (
        <Suggestion key={label} suggestion={command} onClick={() => onSelect(command)}>
          <Icon className="size-4" /> {label}
        </Suggestion>
      ))}
    </div>
  );
}