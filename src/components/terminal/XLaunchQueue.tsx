import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Rocket } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBlast } from "@/components/blast/session";
import { supabase } from "@/integrations/supabase/client";
import { resolveLaunchpad } from "@/lib/terminal/launchpad";
import { checkSuipumpLaunch } from "@/lib/terminal/suipump.functions";
import { launchXRequest } from "@/lib/terminal/xLauncher.functions";

type Row = {
  id: string;
  x_username: string;
  fee_receiver_x_username: string | null;
  fee_receiver_wallet: string | null;
  symbol: string;
  name: string;
  launchpad: string;
  dev_buy: boolean;
  ourblast_fee_percent: number;
  status: string;
  token_url: string | null;
  pool_url: string | null;
  notice: string | null;
  underlying: string | null;
  perps_long: boolean | null;
  leverage_bps: number | null;
  starting_cap_usd: number | null;
};

/**
 * The whole launch screen: ticker, name, launchpad, dev buy, fee, one button.
 * Nothing technical is surfaced here on purpose.
 */
export function XLaunchQueue() {
  const { userId, connect } = useBlast();
  const queryClient = useQueryClient();
  const launch = useServerFn(launchXRequest);
  const verify = useServerFn(checkSuipumpLaunch);

  const requests = useQuery({
    queryKey: ["x-launch-requests"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("x_launch_requests")
        .select("id, x_username, fee_receiver_x_username, fee_receiver_wallet, symbol, name, launchpad, dev_buy, ourblast_fee_percent, status, token_url, pool_url, notice, underlying, perps_long, leverage_bps, starting_cap_usd")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const run = useMutation({
    mutationFn: async (requestId: string) => launch({ data: { requestId } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["x-launch-requests"] });
      if (result.status === "DEPLOYED") toast.success("Launched");
      else toast.info(result.notice ?? "Launchpad integration coming soon.");
    },
    onError: () => toast.error("That launch could not be started. Try again in a moment."),
  });

  const check = useMutation({
    mutationFn: async (requestId: string) => verify({ data: { requestId } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["x-launch-requests"] });
      if (result.status === "DEPLOYED") toast.success("Found it — token confirmed");
      else toast.info(result.notice ?? "No token found yet. Try again in a moment.");
    },
    onError: () => toast.error("That check could not run. Try again in a moment."),
  });

  const rows = requests.data ?? [];
  if (!rows.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-body text-xs font-bold uppercase tracking-wide text-primary">New X launches</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => {
          const pad = resolveLaunchpad(row.launchpad);
          const deployed = row.status === "DEPLOYED";
          const parked = !pad.integrated || row.status === "UNAVAILABLE";

          return (
            <article key={row.id} className="rounded-lg border border-border bg-card p-4">
              {deployed ? (
                <>
                  <p className="font-display text-2xl">🚀 ${row.symbol} deployed</p>
                  <p className="mt-1 text-sm text-muted-foreground">Launchpad: {pad.label}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.token_url ? (
                      <Button asChild size="sm">
                        <a href={row.token_url} target="_blank" rel="noreferrer">View token</a>
                      </Button>
                    ) : null}
                    {row.pool_url ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={row.pool_url} target="_blank" rel="noreferrer">View pool</a>
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <header className="flex items-center justify-between gap-2">
                    <p className="font-body text-xs font-bold uppercase text-muted-foreground">🚀 New X launch</p>
                    <Badge variant="outline">@{row.x_username}</Badge>
                    {row.fee_receiver_x_username || row.fee_receiver_wallet ? (
                      <Badge variant="outline">
                        fees →{" "}
                        {row.fee_receiver_x_username
                          ? `@${row.fee_receiver_x_username}`
                          : `${row.fee_receiver_wallet!.slice(0, 6)}…${row.fee_receiver_wallet!.slice(-4)}`}
                      </Badge>
                    ) : null}
                  </header>
                  <p className="mt-2 font-display text-3xl">${row.symbol}</p>
                  <p className="text-sm">{row.name}</p>
                  {row.underlying ? (
                    <p className="mt-1 font-display text-sm text-primary">⚡ {row.underlying.replace(/USD$/, "")} {row.perps_long === false ? "SHORT" : "LONG"} {(row.leverage_bps ?? 10_000) / 10_000}x{row.starting_cap_usd ? ` · MC ~$${row.starting_cap_usd >= 1000 ? `${row.starting_cap_usd / 1000}K` : row.starting_cap_usd}` : ""}</p>
                  ) : null}

                  {parked && pad.id !== "suipump" ? (
                    <p className="mt-3 text-sm text-muted-foreground">{pad.label} launch is not ready yet.</p>
                  ) : (
                    <dl className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between"><dt className="text-muted-foreground">Launchpad</dt><dd>{pad.label}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Dev buy</dt><dd>{row.dev_buy ? "ON" : "OFF"}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">OurBlast fee</dt><dd>{Number(row.ourblast_fee_percent)}%</dd></div>
                    </dl>
                  )}

                  {row.notice && parked && pad.id === "suipump" ? (
                    <p className="mt-2 text-sm text-muted-foreground">{row.notice}</p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {parked && pad.id === "suipump" ? (
                      <>
                        <Button asChild size="sm">
                          <a href={`${pad.site}/?symbol=${row.symbol}`} target="_blank" rel="noreferrer">
                            Create ${row.symbol} on {pad.label}
                          </a>
                        </Button>
                        {userId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={check.isPending}
                            onClick={() => check.mutate(row.id)}
                          >
                            I launched it — check
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => void connect()}>Sign in to confirm</Button>
                        )}
                      </>
                    ) : parked ? (
                      <Button size="sm" variant="outline" disabled>Launchpad integration coming soon</Button>
                    ) : !userId ? (
                      <Button size="sm" onClick={() => void connect()}>Sign in to launch</Button>
                    ) : (
                      <Button size="sm" disabled={run.isPending} onClick={() => run.mutate(row.id)}>
                        <Rocket className="size-4" /> Launch
                      </Button>
                    )}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
