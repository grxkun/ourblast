import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Fuel } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useBlast } from "@/components/blast/session";
import { createGasReserve, getGasReserveStatus } from "@/lib/terminal/gas-reserve.functions";
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
        Launch calls from {X_BOT_HANDLE} on X are signed with gas from this reserve. Its key is generated and
        encrypted on the backend — nobody holds it, so the balance can only be spent sponsoring launches.
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
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            No reserve yet. An admin creates it once; the address then stays fixed and public.
          </p>
          <Button type="button" onClick={() => create.mutate()} disabled={!userId || create.isPending}>
            {create.isPending ? "Creating…" : "Create gas reserve"}
          </Button>
        </div>
      )}
    </section>
  );
}
