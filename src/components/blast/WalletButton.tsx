import { Link } from "@tanstack/react-router";

import { PlayerAvatar } from "@/components/blast/PlayerBadge";
import { useBlast } from "@/components/blast/session";
import { Button } from "@/components/ui/button";
import { formatNumber, shortAddress } from "@/lib/blast";
import { cn } from "@/lib/utils";

export function WalletButton({ className }: { className?: string }) {
  const { profile, connect, connecting, userId } = useBlast();

  if (userId && profile) {
    return (
      <Link
        to="/profile"
        className={cn(
          "panel flex items-center gap-3 px-3 py-2 transition-transform hover:-translate-y-0.5",
          className,
        )}
      >
        <PlayerAvatar address={profile.wallet_address} size={32} />
        <span className="hidden leading-tight sm:block">
          <span className="block font-body text-xs text-muted-foreground">
            {shortAddress(profile.wallet_address)}
          </span>
          <span className="block font-display text-sm text-lime">
            {formatNumber(profile.points)} PTS
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Button
      type="button"
      onClick={() => void connect()}
      disabled={connecting}
      className={cn(
        "glow-blast rounded-full bg-primary px-5 py-2.5 font-display text-sm tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5 disabled:opacity-60",
        className,
      )}
    >
      {connecting ? "Connecting…" : "Connect Sui Wallet"}
    </Button>
  );
}
