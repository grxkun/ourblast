import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useBlast } from "@/components/blast/session";
import { disconnectXAccount, getXConnectionStatus, startXConnect } from "@/lib/terminal/x-oauth.functions";

/**
 * Connect X uses a same-tab redirect (no popup): popup blockers on mobile
 * silently killed the old flow. X sends the user back to /oauth/x/return,
 * which completes the exchange and lands them back on /terminal.
 */
export function XConnectButton() {
  const { userId, ready, connecting, loginWithX } = useBlast();
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getXConnectionStatus);
  const startFn = useServerFn(startXConnect);
  const disconnectFn = useServerFn(disconnectXAccount);

  const status = useQuery({
    queryKey: ["x-connection", userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: () => statusFn({}),
  });

  const connect = useMutation({
    mutationFn: async () => {
      sessionStorage.setItem("ourblast.x.flow", "connect");
      const { authorizationUrl } = await startFn({});
      window.location.assign(authorizationUrl);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not connect X."),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectFn({}),
    onSuccess: () => {
      toast("X account disconnected.");
      void queryClient.invalidateQueries({ queryKey: ["x-connection", userId] });
    },
    onError: () => toast.error("Could not disconnect X."),
  });

  if (!ready) {
    return (
      <Button type="button" variant="outline" disabled>
        <Loader2 className="animate-spin" /> Checking sign-in…
      </Button>
    );
  }

  if (!userId) {
    return (
      <Button type="button" variant="outline" disabled={connecting} onClick={() => void loginWithX()}>
        {connecting ? <Loader2 className="animate-spin" /> : <AtSign />} Continue with X
      </Button>
    );
  }

  const account = status.data?.account ?? null;
  if (account) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => disconnect.mutate()}
        disabled={disconnect.isPending}
        title="Disconnect this X account"
      >
        {disconnect.isPending ? <Loader2 className="animate-spin" /> : <AtSign />} 𝕏 @{account.username}
      </Button>
    );
  }

  const configured = status.data?.configured ?? false;
  return (
    <Button
      type="button"
      variant="outline"
      disabled={connect.isPending || status.isLoading}
      onClick={() => {
        if (!configured) {
          toast("X connection is not configured yet.");
          return;
        }
        connect.mutate();
      }}
    >
      {connect.isPending ? <Loader2 className="animate-spin" /> : <AtSign />} Link X to use @Ourblastbot
    </Button>
  );
}
