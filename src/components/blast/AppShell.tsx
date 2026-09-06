import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { WalletButton } from "@/components/blast/WalletButton";

const NAV = [
  { to: "/", label: "$BLAST", icon: "💥" },
  { to: "/hub", label: "Hub", icon: "🏠" },
  { to: "/arcade", label: "Arcade", icon: "🕹️" },
  { to: "/leaderboard", label: "Ranks", icon: "🏆" },
  { to: "/meme", label: "Meme", icon: "😂" },
  { to: "/roast", label: "Roast", icon: "🔥" },
  { to: "/chat", label: "Chat", icon: "💬" },
  { to: "/profile", label: "You", icon: "👾" },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // The $BLAST landing page brings its own header and footer.
  if (pathname === "/") return <>{children}</>;

  return (
    <div className="theme-paper min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/hub" className="flex items-center gap-2">
            <span className="glow-blast grid size-9 place-items-center rounded-xl bg-primary font-display text-lg text-primary-foreground">
              O
            </span>
            <span className="font-display text-xl tracking-wide">
              OUR<span className="text-primary">BLAST</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.slice(0, 7).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: "bg-secondary text-foreground" }}
                className="rounded-full px-4 py-2 font-body text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <WalletButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 lg:pb-16">{children}</main>

      <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-border bg-background/90 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-1 py-1.5">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              activeProps={{ className: "text-primary" }}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-muted-foreground"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {item.icon}
              </span>
              <span className="font-body text-[0.62rem] font-semibold tracking-wide uppercase">
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function SectionTitle({
  kicker,
  title,
  action,
}: {
  kicker?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker ? (
          <p className="font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">
            {kicker}
          </p>
        ) : null}
        <h2 className="mt-1 font-display text-3xl leading-none sm:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
