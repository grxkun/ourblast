import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { loginMessage } from "@/lib/blast";
import { walletLogin } from "@/lib/auth.functions";

export type Profile = {
  id: string;
  wallet_address: string;
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
  disconnect: () => Promise<void>;
  refresh: () => void;
};

const BlastContext = createContext<BlastSession | null>(null);

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

  // Supabase session (wallet-backed) --------------------------------------
  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserId(data.session?.user?.id ?? null);
      setReady(true);
    });
    return () => {
      active = false;
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

  const disconnect = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
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
      refresh: () => {
        void queryClient.invalidateQueries();
      },
    }),
    [userId, profileQuery.data, wallets, connecting, ready, connect, disconnect, queryClient],
  );

  return <BlastContext.Provider value={value}>{children}</BlastContext.Provider>;
}
