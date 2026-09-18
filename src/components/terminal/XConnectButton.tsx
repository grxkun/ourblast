import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useBlast } from "@/components/blast/session";
import {
  completeXConnect,
  disconnectXAccount,
  getXConnectionStatus,
  startXConnect,
} from "@/lib/terminal/x-oauth.functions";

/** Wait for the popup to post the one-time code back to this window. */
function waitForCode(popup: Window | null) {
  return new Promise<{ code: string; state: string } | null>((resolve) => {
    if (!popup) return resolve(null);
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedTimer);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; code?: string; state?: string };
      if (data?.type === "xOAuthComplete" && data.code && data.state) {
        cleanup();
        resolve({ code: data.code, state: data.state });
      }
      if (data?.type === "xOAuthFailed") {
        cleanup();
        resolve(null);
      }
    };
    const closedTimer = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        resolve(null);
      }
    }, 500);
    window.addEventListener("message", onMessage);
  });
}

export function XConnectButton() {
  const { userId } = useBlast();
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getXConnectionStatus);
  const startFn = useServerFn(startXConnect);
  const completeFn = useServerFn(completeXConnect);
  const disconnectFn = useServerFn(disconnectXAccount);

  const status = useQuery({
    queryKey: ["x-connection", userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: () => statusFn({}),
  });

  const connect = useMutation({
    mutationFn: async () => {
      // Open during the click so the browser does not block the popup.
      const popup = window.open("about:blank", "x-oauth", "width=600,height=760");
      try {
        const { authorizationUrl } = await startFn({});
        if (popup) popup.location.href = authorizationUrl;
        else window.location.href = authorizationUrl;
      } catch (error) {
        popup?.close();
        throw error;
      }
      const result = await waitForCode(popup);
      if (!result) throw new Error("X connection was cancelled.");
      return completeFn({ data: result });
    },
    onSuccess: (result) => {
      toast.success(`Connected 𝕏 @${result.account.username}`);
      void queryClient.invalidateQueries({ queryKey: ["x-connection", userId] });
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

  if (!userId) {
    return (
      <Button type="button" variant="outline" onClick={() => toast("Connect your Sui wallet first.")}>
        <AtSign /> Connect X
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
      {connect.isPending ? <Loader2 className="animate-spin" /> : <AtSign />} Connect X
    </Button>
  );
}
