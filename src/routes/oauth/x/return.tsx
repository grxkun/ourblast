import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { completeXConnect } from "@/lib/terminal/x-oauth.functions";
import { completeXLogin } from "@/lib/terminal/x-login.functions";

/** Set before leaving for X so we know whether this was a sign-in or a link-up. */
export const X_FLOW_KEY = "ourblast.x.flow";

/** Optional in-app path to land on after the X round-trip (e.g. a claim page). */
export const X_RETURN_TO_KEY = "ourblast.x.returnTo";

export const Route = createFileRoute("/oauth/x/return")({
  head: () => ({
    meta: [
      { title: "X sign-in — OURBLAST" },
      { name: "description", content: "Completing a secure X sign-in for the OURBLAST terminal." },
      { property: "og:title", content: "X sign-in — OURBLAST" },
      { property: "og:description", content: "Completing a secure X sign-in for the OURBLAST terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: XReturn,
});

function XReturn() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const connectFn = useServerFn(completeXConnect);
  const loginFn = useServerFn(completeXLogin);
  const [message, setMessage] = useState("Finishing X sign-in…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error_description") ?? params.get("error");
    const flow = sessionStorage.getItem(X_FLOW_KEY) ?? "login";
    sessionStorage.removeItem(X_FLOW_KEY);
    const stored = sessionStorage.getItem(X_RETURN_TO_KEY);
    sessionStorage.removeItem(X_RETURN_TO_KEY);
    // Only same-site app paths, never an attacker-supplied absolute URL.
    const returnTo = stored && /^\/[A-Za-z0-9\-._~/]*$/.test(stored) ? stored : "/terminal";

    const fail = (reason: string) => {
      setMessage(reason);
      toast.error(reason);
      void navigate({ to: returnTo });
    };

    if (!code || !state) {
      fail(error ?? "X did not complete the sign-in.");
      return;
    }

    const finish = async () => {
      if (flow === "connect") {
        const result = await connectFn({ data: { code, state } });
        toast.success(`Connected 𝕏 @${result.account.username}`);
      } else {
        const result = await loginFn({ data: { code, state } });
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: result.email,
          password: result.password,
        });
        if (signInError) throw new Error("Could not open your OURBLAST session.");
        await queryClient.invalidateQueries();
        toast.success(`Signed in as 𝕏 @${result.username} 💥`);
      }
      void navigate({ to: returnTo });
    };

    finish().catch((err: unknown) => {
      fail(err instanceof Error ? err.message : "Could not finish the X sign-in.");
    });
  }, [connectFn, loginFn, navigate, queryClient]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground">
      <p className="font-mono text-sm">{message}</p>
    </main>
  );
}
