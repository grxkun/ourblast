// SPDX-License-Identifier: BUSL-1.1
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";

import helmet from "@/assets/blast-logo.jpg.asset.json";
import { useBlast } from "@/components/blast/session";
import { WalletButton } from "@/components/blast/WalletButton";
import { MotionDoodles } from "@/components/site/MotionDoodles";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { amIStaff } from "@/lib/admin.functions";

const NAV = [
  { to: "/", label: "Terminal", icon: "⌨️" },
  { to: "/launches", label: "Launches", icon: "🚀" },
  { to: "/assets", label: "Assets", icon: "🖼️" },
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { userId } = useBlast();
  const staffFn = useServerFn(amIStaff);
  const staff = useQuery({
    queryKey: ["am-i-staff", userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: () => staffFn({}),
  });
  const isStaff = Boolean(staff.data?.staff);

  // The Telegram Mini App has its own header and bottom dock.
  if (pathname === "/tg") return <div className="theme-paper min-h-screen">{children}</div>;

  return (
    <div className="theme-paper relative min-h-screen">
      <MotionDoodles />
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 lg:flex lg:justify-between lg:py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <img
              src={helmet.url}
              alt="OURBLAST logo"
              width={36}
              height={36}
              className="size-9 shrink-0 rounded-xl border-2 border-border object-cover"
            />
            <span className="truncate font-display text-lg tracking-wide sm:text-xl">
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

          <div className="flex shrink-0 items-center gap-2">
            {isStaff ? (
              <Link
                to="/admin"
                className="hidden rounded-full border-2 border-border px-3 py-1.5 font-body text-xs font-bold uppercase text-primary sm:inline-flex lg:hidden"
              >
                Admin
              </Link>
            ) : null}
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="app-content mx-auto max-w-6xl px-4 pt-8 sm:px-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-16">{children}</main>

      <MobileDock pathname={pathname} isStaff={isStaff} />
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

const DOCK = ["/", "/launches", "/assets", "/hub"] as const;

function MobileDock({ pathname, isStaff }: { pathname: string; isStaff: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const dock = NAV.filter((n) => (DOCK as readonly string[]).includes(n.to));
  const more = NAV.filter((n) => !(DOCK as readonly string[]).includes(n.to));
  const moreActive = more.some((n) => isActive(n.to)) || (isStaff && pathname.startsWith("/admin"));

  const item = (active: boolean) =>
    `flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-colors ${
      active ? "bg-secondary text-primary" : "text-muted-foreground active:bg-secondary/60"
    }`;

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch gap-1 px-2 py-1.5">
          {dock.map((n) => (
            <Link key={n.to} to={n.to} aria-current={isActive(n.to) ? "page" : undefined} className={item(isActive(n.to))}>
              <span aria-hidden="true" className="text-lg leading-none">{n.icon}</span>
              <span className="font-body text-[0.65rem] font-semibold tracking-wide uppercase">{n.label}</span>
            </Link>
          ))}
          <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className={item(moreActive || open)}>
            <span aria-hidden="true" className="text-lg leading-none">☰</span>
            <span className="font-body text-[0.65rem] font-semibold tracking-wide uppercase">More</span>
          </button>
        </div>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="theme-paper max-h-[80vh] overflow-y-auto rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">All pages</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {more.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-border p-2 text-center ${
                  isActive(n.to) ? "bg-secondary text-primary" : "bg-card text-foreground"
                }`}
              >
                <span aria-hidden="true" className="text-2xl leading-none">{n.icon}</span>
                <span className="font-body text-xs font-semibold">{n.label}</span>
              </Link>
            ))}
            {isStaff ? (
              <Link to="/admin" className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-border bg-card p-2 text-center text-primary">
                <span aria-hidden="true" className="text-2xl leading-none">🛡️</span>
                <span className="font-body text-xs font-semibold">Admin</span>
              </Link>
            ) : null}
            <a href="https://t.me/ourblastsuibot" target="_blank" rel="noreferrer" className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-border bg-card p-2 text-center">
              <span aria-hidden="true" className="text-2xl leading-none">✈️</span>
              <span className="font-body text-xs font-semibold">Telegram bot</span>
            </a>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
