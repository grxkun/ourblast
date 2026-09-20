import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getSuipumpDeployerStatus } from "@/lib/terminal/suipump-launch.functions";

/**
 * Staff view of the Suipump launch adapter. Everything is built; this card says
 * plainly whether Suipump has granted the OurBlastBot wallet a launch ticket.
 */
export function SuipumpReadinessCard() {
  const read = useServerFn(getSuipumpDeployerStatus);
  const status = useQuery({ queryKey: ["suipump-readiness"], queryFn: () => read({}), staleTime: 30_000 });

  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide">Suipump launch readiness</h2>
      {status.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Checking…</p> : null}
      {status.error ? <p className="mt-2 text-sm text-muted-foreground">Could not read the launch status.</p> : null}
      {status.data ? (
        <div className="mt-3 space-y-2 text-sm">
          <p className={status.data.ready ? "font-semibold text-foreground" : "text-muted-foreground"}>
            {status.data.ready ? "Ready — launches will run automatically." : "Waiting on launch access."}
          </p>
          <dl className="grid gap-1 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Deployer wallet</dt>
              <dd className="break-all font-mono text-xs">{status.data.deployerAddress ?? "not configured"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Wallet balance</dt>
              <dd>{status.data.balanceSui.toLocaleString(undefined, { maximumFractionDigits: 3 })} SUI</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Launch tickets held</dt>
              <dd>{status.data.tickets}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Token treasuries held</dt>
              <dd>{status.data.treasuryCaps}</dd>
            </div>
          </dl>
          {status.data.missing.length > 0 ? (
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {status.data.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
