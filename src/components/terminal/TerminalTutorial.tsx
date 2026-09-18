import { useEffect, useState } from "react";
import { HelpCircle, Wallet, AtSign, Rocket, MessageSquareText } from "lucide-react";

const STORAGE_KEY = "ourblast.tutorial.terminal.v1";

const STEPS = [
  {
    icon: Wallet,
    title: "Connect your Sui wallet",
    body: "Hit Connect Sui Wallet in the top bar. Slush is the provider. The terminal never asks for private keys — every real action will wait for your wallet to sign.",
    example: null,
  },
  {
    icon: AtSign,
    title: "Connect X (optional)",
    body: "Link your X account with the Connect X button so launches and replies can be tied to your 𝕏 identity. Your tokens stay encrypted on the backend.",
    example: null,
  },
  {
    icon: MessageSquareText,
    title: "Talk to the terminal",
    body: "Type plain commands in the input at the bottom, or tap a suggestion chip. Try checking a token or viewing your wallet.",
    example: "check $BLAST",
  },
  {
    icon: Rocket,
    title: "Launch a token",
    body: "Describe the launch and the terminal builds a config card you can edit: name, symbol, description and image. Nothing goes on-chain until you confirm.",
    example: "launch $DOG Sui Dog",
  },
] as const;

export function TerminalTutorial({ onTry }: { onTry?: (command: string) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) !== "1") setOpen(true);
  }, []);

  const close = (markDone: boolean) => {
    if (markDone) window.localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 font-body text-sm transition-transform hover:-translate-y-0.5"
      >
        <HelpCircle className="size-4" /> Tutorial
      </button>
    );
  }

  const current = STEPS[step]!;
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="font-body text-xs font-bold tracking-[0.22em] text-primary uppercase">
            Terminal walkthrough
          </p>
          <h3 className="mt-1 font-display text-2xl">
            Step {step + 1} of {STEPS.length} — {current.title}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span
                key={s.title}
                className={`size-2.5 rounded-full border-2 border-border ${
                  i < step ? "bg-primary" : i === step ? "bg-lime" : "bg-transparent"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => close(true)}
            className="rounded-full border border-border px-4 py-1.5 font-body text-sm"
          >
            Skip
          </button>
        </div>
      </div>

      <div className="px-5 py-6 sm:px-8">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Icon className="size-6" />
          </span>
          <p className="font-body text-muted-foreground">{current.body}</p>
        </div>

        {current.example ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <code className="rounded-md border border-border bg-secondary/50 px-3 py-2 font-mono text-sm">
              &gt; {current.example}
            </code>
            {onTry ? (
              <button
                type="button"
                onClick={() => {
                  close(true);
                  onTry(current.example!);
                }}
                className="glow-blast rounded-full bg-primary px-5 py-2 font-display text-sm tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5"
              >
                Try it
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-full border-2 border-border px-5 py-2 font-display text-sm tracking-wide uppercase disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => (last ? close(true) : setStep((s) => s + 1))}
            className="rounded-full bg-primary px-5 py-2 font-display text-sm tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5"
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
