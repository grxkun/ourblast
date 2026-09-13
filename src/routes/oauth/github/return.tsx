import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/github/return")({
  head: () => ({ meta: [
    { title: "Connect GitHub — Blast Build" },
    { name: "description", content: "Completing a secure GitHub connection for Blast Build." },
    { property: "og:title", content: "Connect GitHub — Blast Build" },
    { property: "og:description", content: "Completing a secure GitHub connection for Blast Build." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: GitHubReturn,
});

function GitHubReturn() {
  const [message, setMessage] = useState("Finishing GitHub connection…");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success") === "true";
    const code = params.get("code");
    const type = success && code ? "appUserConnectorOAuthComplete" : "appUserConnectorOAuthFailed";
    if (!success || !code) setMessage(params.get("error") ?? "GitHub did not complete the connection.");
    window.opener?.postMessage({ type, connectorId: "github", code }, window.location.origin);
    if (success && code) window.close();
  }, []);
  return <main className="theme-build flex min-h-screen items-center justify-center bg-build-bg px-6 text-center text-build-text"><p className="font-mono text-sm">{message}</p></main>;
}
