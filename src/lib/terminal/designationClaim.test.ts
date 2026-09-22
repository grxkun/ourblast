import { beforeEach, describe, expect, it } from "vitest";

import {
  CLAIM_MESSAGES,
  performDesignationClaim,
  type DesignationClaimStore,
  type DesignationRow,
} from "@/lib/terminal/designationClaim";

const TOKEN = "0x" + "c".repeat(64);
const RECIPIENT_WALLET = "0x" + "a".repeat(64);
const OTHER_WALLET = "0x" + "b".repeat(64);

type World = {
  rows: Map<string, DesignationRow>;
  wallets: Map<string, string>;
  xAccounts: Map<string, string>;
  claims: number;
  store: DesignationClaimStore;
};

function makeWorld(overrides: Partial<DesignationRow> = {}): World {
  const rows = new Map<string, DesignationRow>([
    [
      TOKEN,
      {
        token_address: TOKEN,
        recipient_wallet: RECIPIENT_WALLET,
        recipient_x_handle: "adiniyi",
        status: "designated",
        unclaimed_amount: 12.5,
        designation_tx: "digest-1",
        claimed_wallet: null,
        ...overrides,
      },
    ],
  ]);
  const wallets = new Map<string, string>();
  const xAccounts = new Map<string, string>();
  const world = {
    rows,
    wallets,
    xAccounts,
    claims: 0,
  } as World;

  world.store = {
    async getDesignation(tokenAddress) {
      return rows.get(tokenAddress) ?? null;
    },
    async getWallet(userId) {
      return wallets.get(userId) ?? null;
    },
    async getXUsername(userId) {
      return xAccounts.get(userId) ?? null;
    },
    async markClaimed({ tokenAddress, wallet, amount }) {
      const row = rows.get(tokenAddress);
      if (!row || row.status === "claimed") return null; // atomic: unclaimed only
      const next: DesignationRow = {
        ...row,
        status: "claimed",
        claimed_wallet: wallet,
        unclaimed_amount: 0,
      };
      rows.set(tokenAddress, next);
      world.claims += 1;
      void amount;
      return next;
    },
  };

  return world;
}

describe("creator-fee designation claim (recipient only)", () => {
  let world: World;
  const recipient = "user-recipient";
  const attacker = "user-attacker";

  beforeEach(() => {
    world = makeWorld();
  });

  it("the designated recipient claims successfully", async () => {
    world.wallets.set(recipient, RECIPIENT_WALLET);
    world.xAccounts.set(recipient, "@AdiniyI");

    const result = await performDesignationClaim(world.store, recipient, TOKEN);
    expect(result).toEqual({ ok: true, message: CLAIM_MESSAGES.success });
    expect(world.rows.get(TOKEN)?.claimed_wallet).toBe(RECIPIENT_WALLET);
    expect(world.rows.get(TOKEN)?.unclaimed_amount).toBe(0);
  });

  it("accepts the recipient wallet regardless of letter case or padding", async () => {
    world.wallets.set(recipient, `  0x${"A".repeat(64)} `);
    const result = await performDesignationClaim(world.store, recipient, TOKEN.toUpperCase());
    expect(result.ok).toBe(true);
  });

  it("refuses a different wallet even when everything else lines up", async () => {
    world.wallets.set(attacker, OTHER_WALLET);
    world.xAccounts.set(attacker, "adiniyi");

    const result = await performDesignationClaim(world.store, attacker, TOKEN);
    expect(result).toEqual({ ok: false, message: CLAIM_MESSAGES.wrongWallet });
    expect(world.rows.get(TOKEN)?.status).toBe("designated");
    expect(world.claims).toBe(0);
  });

  it("refuses a mismatched X account even when the wallet matches", async () => {
    world.wallets.set(attacker, RECIPIENT_WALLET);
    world.xAccounts.set(attacker, "@someoneelse");

    const result = await performDesignationClaim(world.store, attacker, TOKEN);
    expect(result).toEqual({ ok: false, message: CLAIM_MESSAGES.wrongHandle });
    expect(world.rows.get(TOKEN)?.status).toBe("designated");
    expect(world.claims).toBe(0);
  });

  it("refuses an account with no wallet connected", async () => {
    const result = await performDesignationClaim(world.store, attacker, TOKEN);
    expect(result).toEqual({ ok: false, message: CLAIM_MESSAGES.noWallet });
    expect(world.claims).toBe(0);
  });

  it("refuses an unknown token", async () => {
    world.wallets.set(recipient, RECIPIENT_WALLET);
    const result = await performDesignationClaim(world.store, recipient, "0xdeadbeef");
    expect(result).toEqual({ ok: false, message: CLAIM_MESSAGES.missing });
  });

  it("refuses a recalled endorsement", async () => {
    world = makeWorld({ status: "recalled" });
    world.wallets.set(recipient, RECIPIENT_WALLET);
    const result = await performDesignationClaim(world.store, recipient, TOKEN);
    expect(result).toEqual({ ok: false, message: CLAIM_MESSAGES.recalled });
    expect(world.claims).toBe(0);
  });

  it("refuses a second claim and never double-pays", async () => {
    world.wallets.set(recipient, RECIPIENT_WALLET);

    const first = await performDesignationClaim(world.store, recipient, TOKEN);
    const second = await performDesignationClaim(world.store, recipient, TOKEN);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, message: CLAIM_MESSAGES.claimed });
    expect(world.claims).toBe(1);
  });

  it("concurrent claims: exactly one wins", async () => {
    world.wallets.set(recipient, RECIPIENT_WALLET);

    const results = await Promise.all([
      performDesignationClaim(world.store, recipient, TOKEN),
      performDesignationClaim(world.store, recipient, TOKEN),
      performDesignationClaim(world.store, recipient, TOKEN),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(world.claims).toBe(1);
  });

  it("a concurrent attacker cannot ride along with the real recipient", async () => {
    world.wallets.set(recipient, RECIPIENT_WALLET);
    world.wallets.set(attacker, OTHER_WALLET);

    const [mine, theirs] = await Promise.all([
      performDesignationClaim(world.store, recipient, TOKEN),
      performDesignationClaim(world.store, attacker, TOKEN),
    ]);
    expect(mine.ok).toBe(true);
    expect(theirs.ok).toBe(false);
    expect(world.rows.get(TOKEN)?.claimed_wallet).toBe(RECIPIENT_WALLET);
    expect(world.claims).toBe(1);
  });
});
