import { AtSign, Loader2, Wallet } from "lucide-react";

import { useBlast } from "@/components/blast/session";
import { Button } from "@/components/ui/button";

/**
 * Sign-in choices for the terminal. A social account is enough to talk to the
 * terminal, keep history and draft launches; signing anything on Sui still asks
 * for a wallet, which can be connected later from the same header.
 */
export function SocialSignIn() {
  const { userId, connect, connecting, loginWithGoogle, loginWithX } = useBlast();
  if (userId) return null;

  return (
    <section className="panel space-y-4 p-5">
      <div>
        <p className="font-display text-lg">Sign in to the terminal</p>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Use a social account to start straight away — no wallet, no extension. Connect a Sui wallet
          whenever you want to sign a launch yourself.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={connecting} onClick={() => void loginWithGoogle()}>
          {connecting ? <Loader2 className="animate-spin" /> : null} Continue with Google
        </Button>
        <Button type="button" variant="outline" disabled={connecting} onClick={() => void loginWithX()}>
          <AtSign /> Continue with X
        </Button>
        <Button type="button" variant="outline" disabled={connecting} onClick={() => void connect()}>
          <Wallet /> Connect Sui Wallet
        </Button>
      </div>
    </section>
  );
}
