import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Fuel } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useBlast } from "@/components/blast/session";
import { adoptBotGasReserve, createGasReserve, getGasReserveStatus } from "@/lib/terminal/gas-reserve.functions";
import { GAS_RESERVE_INITIAL_SUI, GAS_RESERVE_TOPUP_SUI } from "@/lib/terminal/gas-reserve";
import { formatSui } from "@/lib/sui-balance";
import { X_BOT_HANDLE } from "@/lib/terminal/x-bot";

export function GasReserveCard() {
  const { userId } = useBlast();
  const statusFn = useServerFn(getGasReserveStatus);
  const createFn = useServerFn(createGasReserve);
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ["gas-reserve"],
    queryFn: () => statusFn({}),
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: () => createFn({}),
    onSuccess: () => {
      toast.success("Gas reserve created.");
      void queryClient.invalidateQueries({ queryKey: ["gas-reserve"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not create the gas reserve."),
  });

  const adoptFn = useServerFn(adoptBotGasReserve);
  const adopt = useMutation({
    mutationFn: () => adoptFn({}),
    onSuccess: () => {
      toast.success("The @ourblastbot wallet is now the gas source.");
      void queryClient.invalidateQueries({ queryKey: ["gas-reserve"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not set the @ourblastbot wallet."),
  });

  const data = status.data;

  return (
    <section className="border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg uppercase"><Fuel className="mr-2 inline size-4" />Gas reserve</h2>
        {data?.created ? (
          <span className="font-display text-xs uppercase text-muted-foreground">
            {formatSui(data.balanceSui)} SUI{data.low ? " · low" : ""}
          </span>
        ) : null}
      </header>

      <p className="mt-2 text-sm text-muted-foreground">
        Launch calls from {X_BOT_HANDLE} on X are signed with gas from this reserve. Its key is stored encrypted on
        the backend and never reaches the browser, so the balance can only be spent sponsoring launches.
      </p>

      {data?.created && data.address ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate border border-border bg-muted px-2 py-1 text-xs">{data.address}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(data.address!);
                toast.success("Address copied.");
              }}
            >
              <Copy /> Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Send {GAS_RESERVE_INITIAL_SUI} SUI here to start sponsoring. Every creator-fee claim adds{" "}
            {GAS_RESERVE_TOPUP_SUI} SUI back to it — {formatSui(data.contributedSui)} SUI contributed so far.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => adopt.mutate()}
            disabled={!userId || adopt.isPending}
          >
            {adopt.isPending ? "Switching…" : `Use the ${X_BOT_HANDLE} wallet`}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <p className="w-full text-xs text-muted-foreground">
            No reserve yet. An admin sets it once; the address then stays fixed and public.
          </p>
          <Button type="button" onClick={() => adopt.mutate()} disabled={!userId || adopt.isPending}>
            {adopt.isPending ? "Setting…" : `Use the ${X_BOT_HANDLE} wallet`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => create.mutate()}
            disabled={!userId || create.isPending}
          >
            {create.isPending ? "Creating…" : "Generate a new one"}
          </Button>
        </div>
      )}
    </section>
  );
}
