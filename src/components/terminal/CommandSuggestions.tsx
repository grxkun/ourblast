import { ChartNoAxesCombined, CircleDollarSign, Coins, Search, WalletCards, Zap } from "lucide-react";

import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";

const suggestions = [
  { icon: Zap, label: "Launch a token", command: "launch $DOG Sui Dog" },
  { icon: Search, label: "Check a token", command: "check $DOG" },
  { icon: ChartNoAxesCombined, label: "Check bonding curve", command: "check bonding curve $DOG" },
  { icon: WalletCards, label: "View wallet", command: "wallet" },
  { icon: Coins, label: "My launches", command: "show my launches" },
  { icon: CircleDollarSign, label: "Trade", command: "buy 2 SUI of $DOG" },
] as const;

export function CommandSuggestions({ onSelect }: { onSelect: (command: string) => void }) {
  return (
    <Suggestions className="flex-wrap justify-center overflow-visible px-0">
      {suggestions.map(({ icon: Icon, label, command }) => (
        <Suggestion key={label} suggestion={command} onClick={() => onSelect(command)}>
          <Icon className="size-4" /> {label}
        </Suggestion>
      ))}
    </Suggestions>
  );
}