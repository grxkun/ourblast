import { useState } from "react";

export function CopyAddress({
  address,
  label = "contract address",
}: {
  address: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="ink-box flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
    >
      <span className="truncate font-body text-sm sm:text-base">{address}</span>
      <span className="shrink-0 rounded-md border-[3px] border-border bg-primary px-3 py-1 font-display text-sm tracking-wide text-primary-foreground">
        {copied ? "COPIED" : "COPY"}
      </span>
    </button>
  );
}
