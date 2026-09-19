import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { completeXConnect } from "@/lib/terminal/x-oauth.functions";

export const Route = createFileRoute("/oauth/x/return")({
  head: () => ({
    meta: [
      { title: "Connect X — OURBLAST" },
      { name: "description", content: "Completing a secure X connection for the OURBLAST terminal." },
      { property: "og:title", content: "Connect X — OURBLAST" },
      { property: "og:description", content: "Completing a secure X connection for the OURBLAST terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: XReturn,
});

function XReturn() {
  const navigate = useNavigate();
  const completeFn = useServerFn(completeXConnect);
  const [message, setMessage] = useState("Finishing X connection…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error_description") ?? params.get("error");

    if (!code || !state) {
      const reason = error ?? "X did not complete the connection.";
      setMessage(reason);
      toast.error(reason);
      void navigate({ to: "/terminal" });
      return;
    }

    completeFn({ data: { code, state } })
      .then((result) => {
        toast.success(`Connected 𝕏 @${result.account.username}`);
        void navigate({ to: "/terminal" });
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : "Could not finish the X connection.";
        setMessage(reason);
        toast.error(reason);
        void navigate({ to: "/terminal" });
      });
  }, [completeFn, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground">
      <p className="font-mono text-sm">{message}</p>
    </main>
  );
}
