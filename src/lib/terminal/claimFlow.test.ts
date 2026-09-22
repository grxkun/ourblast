import { beforeEach, describe, expect, it } from "vitest";

import {
  claimStep,
  normalizeWallet,
  performClaim,
  readClaimViewer,
  type ClaimLink,
  type ClaimStore,
} from "@/lib/terminal/claimFlow";

const WALLET = "0x" + "a".repeat(64);
const OTHER_WALLET = "0x" + "b".repeat(64);

type World = {
  links: Map<string, ClaimLink>;
  xAccounts: Map<string, string>;
  wallets: Map<string, string>;
  payouts: Array<{ userId: string; symbol: string; wallet: string; xUsername: string }>;
  store: ClaimStore;
};

function makeWorld(): World {
  const links = new Map<string, ClaimLink>([
    [
      "tok-monerochan",
      {
        token: "tok-monerochan",
        launch_symbol: "MONEROCHAN",
        x_username: "Mjbdran",
        status: "pending",
        amount_sui: 0,
        claimed_wallet: null,
      },
    ],
  ]);
  const xAccounts = new Map<string, string>();
  const wallets = new Map<string, string>();
  const payouts: World["payouts"] = [];

  const store: ClaimStore = {
    async getLink(token) {
      return links.get(token) ?? null;
    },
    async getXUsername(userId) {
      return xAccounts.get(userId) ?? null;
    },
    async getWallet(userId) {
      return wallets.get(userId) ?? null;
    },
    async markClaimed(token, wallet) {
      const row = links.get(token);
      if (!row || row.status !== "pending") return null; // atomic: pending only
      const next: ClaimLink = { ...row, status: "claimed", claimed_wallet: wallet };
      links.set(token, next);
      return next;
    },
    async rememberPayout(input) {
      payouts.push(input);
    },
  };

  return { links, xAccounts, wallets, payouts, store };
}

describe("creator-fee claim flow (end to end)", () => {
  let world: World;
  const userId = "user-1";

  beforeEach(() => {
    world = makeWorld();
  });

  it("step 1: a visitor with no X connected is asked to connect X", async () => {
    const viewer = await readClaimViewer(world.store, userId, "tok-monerochan");
    expect(viewer.xUsername).toBeNull();
    expect(viewer.reservedFor).toBe("Mjbdran");
    expect(viewer.xMatches).toBe(false);
    expect(claimStep(viewer)).toBe(1);

    const result = await performClaim(world.store, userId, "tok-monerochan");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Sign in with X/i);
  });

  it("step 2: X connected but no wallet linked asks for a wallet", async () => {
    world.xAccounts.set(userId, "@Mjbdran");

    const viewer = await readClaimViewer(world.store, userId, "tok-monerochan");
    expect(viewer.xMatches).toBe(true);
    expect(viewer.wallet).toBeNull();
    expect(claimStep(viewer)).toBe(2);

    const result = await performClaim(world.store, userId, "tok-monerochan");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Connect a Sui wallet/i);
  });

  it("step 3: X + wallet verifies the reserved 70% share and routes future launches", async () => {
    world.xAccounts.set(userId, "Mjbdran");
    world.wallets.set(userId, WALLET);

    const viewer = await readClaimViewer(world.store, userId, "tok-monerochan");
    expect(claimStep(viewer)).toBe(3);

    const result = await performClaim(world.store, userId, "tok-monerochan");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claim.status).toBe("claimed");
    expect(result.claim.claimed_wallet).toBe(WALLET);
    expect(result.message).toContain("MONEROCHAN");
    expect(world.payouts).toEqual([
      { userId, symbol: "MONEROCHAN", wallet: WALLET, xUsername: "Mjbdran" },
    ]);
  });

  it("handle matching ignores @ and letter case", async () => {
    world.xAccounts.set(userId, "@mJBDRAN");
    world.wallets.set(userId, WALLET);
    const result = await performClaim(world.store, userId, "tok-monerochan");
    expect(result.ok).toBe(true);
  });

  it("rejects a different X account even with a wallet linked", async () => {
    world.xAccounts.set("user-2", "SomeoneElse");
    world.wallets.set("user-2", OTHER_WALLET);

    const result = await performClaim(world.store, "user-2", "tok-monerochan");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("These fees are reserved for @Mjbdran, not @SomeoneElse.");
    expect(world.links.get("tok-monerochan")?.status).toBe("pending");
    expect(world.payouts).toHaveLength(0);
  });

  it("rejects an unknown claim token", async () => {
    world.xAccounts.set(userId, "Mjbdran");
    world.wallets.set(userId, WALLET);
    const result = await performClaim(world.store, userId, "tok-does-not-exist");
    expect(result).toEqual({ ok: false, message: "This claim link does not exist." });
  });

  it("rejects an already-claimed link and never double-pays", async () => {
    world.xAccounts.set(userId, "Mjbdran");
    world.wallets.set(userId, WALLET);

    const first = await performClaim(world.store, userId, "tok-monerochan");
    expect(first.ok).toBe(true);

    const second = await performClaim(world.store, userId, "tok-monerochan");
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/already used or has expired/i);
    expect(world.payouts).toHaveLength(1);
    expect(world.links.get("tok-monerochan")?.claimed_wallet).toBe(WALLET);
  });

  it("a concurrent claim loses the race instead of overwriting the wallet", async () => {
    world.xAccounts.set(userId, "Mjbdran");
    world.wallets.set(userId, WALLET);

    const [a, b] = await Promise.all([
      performClaim(world.store, userId, "tok-monerochan"),
      performClaim(world.store, userId, "tok-monerochan"),
    ]);
    const wins = [a, b].filter((r) => r.ok);
    expect(wins).toHaveLength(1);
    expect(world.payouts).toHaveLength(1);
  });

  it("only accepts well-formed Sui wallet addresses", async () => {
    expect(normalizeWallet("  0x" + "A".repeat(64) + " ")).toBe("0x" + "a".repeat(64));
    expect(normalizeWallet("not-a-wallet")).toBeNull();
    expect(normalizeWallet("0x123")).toBeNull();
    expect(normalizeWallet(null)).toBeNull();

    world.xAccounts.set(userId, "Mjbdran");
    world.wallets.set(userId, "0x123");
    const result = await performClaim(world.store, userId, "tok-monerochan");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Connect a Sui wallet/i);
  });
});
