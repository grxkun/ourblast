import { createFileRoute } from "@tanstack/react-router";
import { Terminal } from "@/components/terminal/Terminal";

export const Route = createFileRoute("/terminal")({
  head: () => ({
    meta: [
      { title: "Conversational Terminal | OURBLAST" },
      {
        name: "description",
        content: "Secure command-line interface for the Blast ecosystem. Direct AI-assisted building and community coordination.",
      },
    ],
  }),
  component: TerminalPage,
});

function TerminalPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto py-10">
      <div>
        <p className="font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">
          Command Center
        </p>
        <h1 className="mt-1 font-display text-4xl sm:text-5xl">Blast Terminal</h1>
        <p className="mt-3 max-w-xl font-body text-muted-foreground">
          A secure, wallet-verified conversational interface for managing your Blast assets and interacting with the island's core infrastructure.
        </p>
      </div>

      <Terminal />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="panel p-4 space-y-2">
          <h3 className="text-xs font-bold text-cyber uppercase tracking-wider">Quick Commands</h3>
          <ul className="text-xs font-mono space-y-1 opacity-70">
            <li>/points - Check balance</li>
            <li>/build - View city stats</li>
            <li>/vault - Treasury status</li>
          </ul>
        </div>
        <div className="panel p-4 space-y-2">
          <h3 className="text-xs font-bold text-cyber uppercase tracking-wider">AI Assistant</h3>
          <p className="text-xs font-mono opacity-70">
            Ask natural language questions about the Blast ecosystem or SUI development.
          </p>
        </div>
        <div className="panel p-4 space-y-2">
          <h3 className="text-xs font-bold text-cyber uppercase tracking-wider">Verification</h3>
          <p className="text-xs font-mono opacity-70">
            Session: <span className="text-green-500">ENCRYPTED</span>
            <br />
            Auth: Wallet Verified
          </p>
        </div>
      </div>
    </div>
  );
}
