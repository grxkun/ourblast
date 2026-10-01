import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";

import helmet from "@/assets/helmet.jpg.asset.json";
import { useBlast } from "@/components/blast/session";
import { WalletButton } from "@/components/blast/WalletButton";
import { amIStaff } from "@/lib/admin.functions";

const NAV = [
  { to: "/", label: "Terminal", icon: "⌨️" },
  { to: "/launches", label: "Launches", icon: "🚀" },
  { to: "/arcade", label: "Arcade", icon: "🕹️" },
  { to: "/build", label: "Build", icon: "🏙️" },
  { to: "/hub", label: "Hub", icon: "🏠" },
  { to: "/leaderboard", label: "Ranks", icon: "🏆" },
  { to: "/chat", label: "Chat", icon: "💬" },
  { to: "/ecosystem", label: "Sui", icon: "◇" },
  { to: "/meme", label: "Meme", icon: "😂" },
  { to: "/roast", label: "Roast", icon: "🔥" },
  { to: "/builders", label: "Builders", icon: "🏗️" },
  { to: "/docs", label: "Docs", icon: "📘" },
  { to: "/how-to-play", label: "Guide", icon: "📖" },
  { to: "/profile", label: "You", icon: "👾" },

] as const;

export function AppShell({ children }: { children: ReactNode }) {
  useRouterState({ select: (state) => state.location.pathname });
  const { userId } = useBlast();
  const staffFn = useServerFn(amIStaff);
  const staff = useQuery({
    queryKey: ["am-i-staff", userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: () => staffFn({}),
  });
  const isStaff = Boolean(staff.data?.staff);


  return (
    <div className="theme-paper min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img
              src={helmet.url}
              alt="OURBLAST helmet mascot"
              width={36}
              height={36}
              className="size-9 rounded-xl border-2 border-border object-cover"
            />
            <span className="font-display text-xl tracking-wide">
              OUR<span className="text-primary">BLAST</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.filter(
              (item) =>
                item.to !== "/how-to-play" &&
                item.to !== "/profile" &&
                item.to !== "/builders" &&
                item.to !== "/meme" &&
                item.to !== "/roast"
            ).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: "bg-secondary text-secondary-foreground" }}
                className="rounded-full px-4 py-2 font-body text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            {isStaff ? (
              <Link
                to="/admin"
                activeProps={{ className: "bg-secondary text-secondary-foreground" }}
                className="rounded-full px-4 py-2 font-body text-sm font-medium text-primary transition-colors hover:text-foreground"
              >
                Admin
              </Link>
            ) : null}
          </nav>

          <div className="flex items-center gap-2">
            {isStaff ? (
              <Link
                to="/admin"
                className="rounded-full border-2 border-border px-3 py-1.5 font-body text-xs font-bold uppercase text-primary lg:hidden"
              >
                Admin
              </Link>
            ) : null}
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 lg:pb-16">{children}</main>

      <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-border bg-background/90 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-1 py-1.5">
          {NAV.filter(
            (item) =>
              item.to !== "/how-to-play" &&
              item.to !== "/builders" &&
              item.to !== "/roast" &&
              item.to !== "/ecosystem" &&
              item.to !== "/leaderboard" &&
              item.to !== "/chat" &&
              item.to !== "/meme"
          ).map((item) => (
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
