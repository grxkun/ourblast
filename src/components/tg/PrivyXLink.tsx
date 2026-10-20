// SPDX-License-Identifier: BUSL-1.1
// Browser-only: loaded lazily from /tg so Privy never runs during SSR.
import { useEffect, useRef } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";

function Inner({ onToken }: { onToken: (t: string) => void }) {
  const { ready, authenticated, login, getAccessToken, user } = usePrivy();
  const sent = useRef(false);
  useEffect(() => {
    if (!authenticated || sent.current || !user?.twitter) return;
    sent.current = true;
    getAccessToken().then((t) => t && onToken(t));
  }, [authenticated, user, getAccessToken, onToken]);
  return (
    <button disabled={!ready} onClick={() => login({ loginMethods: ["twitter"] })}
      className="w-full rounded-md border border-primary bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
      Link X account
    </button>
  );
}

export default function PrivyXLink({ appId, onToken }: { appId: string; onToken: (t: string) => void }) {
  return (
    <PrivyProvider appId={appId} config={{ loginMethods: ["twitter"], embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } } }}>
      <Inner onToken={onToken} />
    </PrivyProvider>
  );
}
