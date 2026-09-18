import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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
  const [message, setMessage] = useState("Finishing X connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error_description") ?? params.get("error");

    if (!code || !state) {
      setMessage(error ?? "X did not complete the connection.");
      window.opener?.postMessage({ type: "xOAuthFailed", error: error ?? "missing_code" }, window.location.origin);
      return;
    }
    // The code is a one-time handle; the opener exchanges it on the server.
    window.opener?.postMessage({ type: "xOAuthComplete", code, state }, window.location.origin);
    window.close();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground">
      <p className="font-mono text-sm">{message}</p>
    </main>
  );
}
