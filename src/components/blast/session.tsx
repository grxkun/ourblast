import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { loginMessage } from "@/lib/blast";
import { walletLogin } from "@/lib/auth.functions";
import { recoverPayment, verifyPayment } from "@/lib/payments.functions";
import { payFeeToTreasury } from "@/lib/sui-pay";
import type { PaymentPurpose } from "@/lib/ourblast.config";

export type Profile = {
  id: string;
  /** Null for players who signed in with Google or X and have no wallet yet. */
  wallet_address: string | null;
  auth_provider: "wallet" | "google" | "x";
  display_name: string | null;
  avatar_url: string | null;
  nickname: string | null;
  avatar_seed: string;
  points: number;
  games_played: number;
  best_score: number;
  streak: number;
  is_banned: boolean;
  muted_until: string | null;
  created_at: string;
};

type DetectedWallet = {
  name: string;
  icon: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
};

type BlastSession = {
  userId: string | null;
  profile: Profile | null;
  wallets: DetectedWallet[];
  connecting: boolean;
  ready: boolean;
  connect: (walletName?: string) => Promise<void>;
  /** Sign in with Google (no wallet needed). */
  loginWithGoogle: () => Promise<void>;
  /** Sign in with an X account (no wallet needed). */
  loginWithX: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => void;
  /** Pays the SUI fee for an activity and returns a server-verified payment id. */
  pay: (purpose: PaymentPurpose) => Promise<string>;
  /** Finds an already-confirmed on-chain payment when the wallet never returned. */
  recoverEntry: (purpose: PaymentPurpose) => Promise<string>;
};

// Keep a single context instance across hot-reloads / duplicate module copies,
// otherwise consumers can read a different context than the provider writes.
const globalStore = globalThis as unknown as {
  __blastContext?: React.Context<BlastSession | null>;
};
const BlastContext =
  globalStore.__blastContext ?? (globalStore.__blastContext = createContext<BlastSession | null>(null));

export function useBlast() {
  const ctx = useContext(BlastContext);
  if (!ctx) throw new Error("useBlast must be used inside <BlastProvider>");
  return ctx;
}

export function BlastProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const active = useRef<{ raw: any; account: any } | null>(null);

  // Supabase session (wallet-backed) --------------------------------------
  useEffect(() => {
    let alive = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUserId(data.session?.user?.id ?? null);
      setReady(true);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Detect Sui wallets (browser only) ------------------------------------
  useEffect(() => {
    let unregister: (() => void) | undefined;
    let cancelled = false;

    const load = async () => {
      const { getWallets } = await import("@mysten/wallet-standard");
      const registry = getWallets();
      const sync = () => {
        if (cancelled) return;
        const list = registry
          .get()
          .filter(
            (w) =>
              "sui:signPersonalMessage" in w.features &&
              "standard:connect" in w.features &&
              w.chains.some((c) => c.startsWith("sui:")),
          )
          .map((w) => ({ name: w.name, icon: w.icon as string, raw: w }));
        setWallets(list);
      };
      sync();
      unregister = registry.on("register", sync);
    };
    void load();
    return () => {
      cancelled = true;
      unregister?.();
    };
  }, []);

  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  const connect = useCallback(
    async (walletName?: string) => {
      const target = walletName
        ? wallets.find((w) => w.name === walletName)
        : (wallets.find((w) => /slush/i.test(w.name)) ?? wallets[0]);
      if (!target) {
        toast.error("No Sui wallet found", {
          description: "Install the Slush wallet extension, then reload this page.",
        });
        return;
      }

      setConnecting(true);
      try {
        const connectResult = await target.raw.features["standard:connect"].connect();
        const account = connectResult?.accounts?.[0] ?? target.raw.accounts?.[0];
        if (!account) throw new Error("No account shared by the wallet.");
        active.current = { raw: target.raw, account };

        const issuedAt = new Date().toISOString();
        const message = loginMessage(account.address, issuedAt);
        const signed = await target.raw.features["sui:signPersonalMessage"].signPersonalMessage({
          message: new TextEncoder().encode(message),
          account,
        });

        const result = await walletLogin({
          data: {
            address: account.address,
            bytes: signed.bytes,
            signature: signed.signature,
            issuedAt,
          },
        });

        const { error } = await supabase.auth.signInWithPassword({
          email: result.email,
          password: result.password,
        });
        if (error) throw error;

        await queryClient.invalidateQueries();
        toast.success(result.isNew ? "Welcome to OURBLAST 💥" : "Helmet on. Welcome back 💥", {
          description:
            result.pointsEarned > 0
              ? `Daily login bonus: +${result.pointsEarned} BLAST POINTS`
              : undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not connect that wallet.";
        toast.error("Connection failed", { description: message });
      } finally {
        setConnecting(false);
      }
    },
    [wallets, queryClient],
  );

  /**
   * Fees are paid straight from the user's wallet to the OURBLAST treasury.
   * The digest is then verified server-side; nothing unlocks before that.
   */
  const pay = useCallback(
    async (purpose: PaymentPurpose) => {
      if (!userId) throw new Error("Connect your wallet first.");

      let session = active.current;
      if (!session) {
        const target = wallets.find((w) => /slush/i.test(w.name)) ?? wallets[0];
        if (!target) throw new Error("No Sui wallet found in this browser.");
        const res = await target.raw.features["standard:connect"].connect();
        const account = res?.accounts?.[0] ?? target.raw.accounts?.[0];
        if (!account) throw new Error("Wallet did not share an account.");
        session = { raw: target.raw, account };
        active.current = session;
      }

      let digest: string;
      try {
        digest = await payFeeToTreasury(session.raw, session.account, purpose);
      } catch (error) {
        // Some wallets (mobile Slush) send the transfer but never return the
        // digest. Look on chain before telling the player the payment failed.
        try {
          const { paymentId } = await recoverPayment({ data: { purpose } });
          return paymentId;
        } catch {
          throw error;
        }
      }

      // Verification already retries briefly on the server. One quick retry
      // covers an unusually slow index without making every message wait.
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 800));
        try {
          const { paymentId } = await verifyPayment({ data: { digest, purpose } });
          return paymentId;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : "";
          if (!/not found on the Sui network|already been used/i.test(message)) throw error;
          if (/already been used/i.test(message)) throw error;
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("Payment could not be confirmed yet. Try again in a moment.");
    },
    [userId, wallets],
  );

  /** Checks the chain for a paid-but-unclaimed entry from this wallet. */
  const recoverEntry = useCallback(async (purpose: PaymentPurpose) => {
    const { paymentId } = await recoverPayment({ data: { purpose } });
    return paymentId;
  }, []);

  const disconnect = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    active.current = null;
    await supabase.auth.signOut();
    setUserId(null);
    toast("Disconnected. Helmet off.");
  }, [queryClient]);

  const value = useMemo<BlastSession>(
    () => ({
      userId,
      profile: profileQuery.data ?? null,
      wallets,
      connecting,
      ready,
      connect,
      disconnect,
      pay,
      recoverEntry,
      refresh: () => {
        void queryClient.invalidateQueries();
      },
    }),
    [
      userId,
      profileQuery.data,
      wallets,
      connecting,
      ready,
      connect,
      disconnect,
      pay,
      recoverEntry,
      queryClient,
    ],
  );

  return <BlastContext.Provider value={value}>{children}</BlastContext.Provider>;
}
