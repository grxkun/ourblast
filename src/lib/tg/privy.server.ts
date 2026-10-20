// SPDX-License-Identifier: BUSL-1.1
import { createRemoteJWKSet, jwtVerify } from "jose";

/** Verifies a Privy access token and returns the linked X username (or null). */
export async function verifiedXFromPrivy(token: string, appId: string, appSecret: string) {
  const jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  const { payload } = await jwtVerify(token, jwks, { issuer: "privy.io", audience: appId });
  const did = payload.sub;
  if (!did) throw new Error("Privy sign-in was not valid");
  const res = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(did)}`, {
    headers: { authorization: `Basic ${btoa(`${appId}:${appSecret}`)}`, "privy-app-id": appId },
  });
  if (!res.ok) {
    console.error(`Privy user lookup failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    throw new Error("Could not read your Privy account");
  }
  const user = (await res.json()) as { linked_accounts?: { type: string; username?: string }[] };
  const x = user.linked_accounts?.find((a) => a.type === "twitter_oauth")?.username ?? null;
  return { did, xUsername: x };
}
