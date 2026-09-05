import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { useBlast } from "@/components/blast/session";
import { roastToken } from "@/lib/community.functions";

export const Route = createFileRoute("/roast")({
  head: () => ({
    meta: [
      { title: "Blast Roast — Get Your Token Roasted by AI | OURBLAST" },
      {
        name: "description",
        content:
          "Drop a ticker into BLAST ROAST and let the AI flame your token in a few brutal lines. Pure comedy, no financial advice.",
      },
      { property: "og:title", content: "BLAST ROAST — Roast my token" },
      {
        property: "og:description",
        content: "Feed a ticker to the roast machine and get flamed in seconds.",
      },
    ],
  }),
  component: RoastPage,
});

function RoastPage() {
  const { userId, connect } = useBlast();
  const roast = useServerFn(roastToken);

  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [output, setOutput] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      roast({
        data: {
          ticker: ticker.trim().replace(/^\$/, ""),
          name: name.trim() || ticker.trim(),
          description: description.trim(),
        },
      }),
    onSuccess: (res) => setOutput(res.roast),
    onError: (error) =>
      toast.error("Roast failed", {
        description: error instanceof Error ? error.message : "Try again in a moment.",
      }),
  });

  const copy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    toast.success("Roast copied");
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">
          Blast roast
        </p>
        <h1 className="mt-1 font-display text-4xl sm:text-5xl">Roast my token</h1>
        <p className="mt-3 max-w-xl font-body text-muted-foreground">
          Enter a ticker and let the roast machine cook. It's a joke bot — no price talk, no advice,
          no mercy.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel space-y-3 p-5 sm:p-6">
          <label className="block font-body text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
            Ticker
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="BLAST"
              maxLength={16}
              className="mt-2 w-full rounded-xl border border-input bg-background/60 px-4 py-3 font-display text-lg tracking-wide normal-case outline-none focus:border-ring"
            />
          </label>
          <label className="block font-body text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
            Token name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Blast Community Coin"
              maxLength={60}
              className="mt-2 w-full rounded-xl border border-input bg-background/60 px-4 py-3 font-body normal-case outline-none focus:border-ring"
            />
          </label>
          <label className="block font-body text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
            The pitch (optional)
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Community takeover, helmets on, no roadmap…"
              maxLength={300}
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-input bg-background/60 px-4 py-3 font-body normal-case outline-none focus:border-ring"
            />
          </label>
          <button
            type="button"
            disabled={mutation.isPending || ticker.trim().length < 1}
            onClick={() => (userId ? mutation.mutate() : void connect())}
            className="glow-blast w-full rounded-full bg-primary px-6 py-3.5 font-display text-xl tracking-wide text-primary-foreground uppercase disabled:opacity-50"
          >
            {mutation.isPending ? "Cooking…" : userId ? "Roast it 🔥" : "Connect to roast"}
          </button>
        </div>

        <div className="panel grid-noise flex min-h-64 flex-col p-5 sm:p-6">
          {output ? (
            <>
              <p className="animate-pop-in flex-1 font-body text-lg leading-relaxed whitespace-pre-line">
                {output}
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-full bg-secondary px-5 py-2.5 font-display tracking-wide text-secondary-foreground uppercase"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                  className="rounded-full border border-border px-5 py-2.5 font-display tracking-wide uppercase disabled:opacity-50"
                >
                  Roast again
                </button>
              </div>
            </>
          ) : (
            <div className="m-auto max-w-xs text-center">
              <span className="text-5xl" aria-hidden="true">
                🔥
              </span>
              <p className="mt-4 font-body text-muted-foreground">
                Your roast lands here. Brace yourself.
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="font-body text-xs text-muted-foreground">
        BLAST ROAST is comedy only. Nothing here is financial advice, and it makes no factual claims
        about any project or person.
      </p>
    </div>
  );
}
