import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Smoke test for the X launcher: an @ourblastbot mention becomes one launch
 * request, shows up as a Suipump launch screen, and only reports "deployed"
 * after the chain confirms it.
 */

type Row = Record<string, unknown>;

const tables: Record<string, Row[]> = {
  launcher_settings: [
    {
      id: true,
      default_launchpad: "suipump",
      ourblast_fee_percent: 10,
      dev_buy_enabled: false,
      auto_launch_enabled: false,
    },
  ],
  x_launch_requests: [],
};

interface Result {
  data: unknown;
  error: null;
}

/** Tiny in-memory stand-in for the PostgREST builder used by the launcher. */
class FakeQuery implements PromiseLike<Result> {
  private readonly filters: Array<[string, unknown]> = [];
  private writeValues: Row | null = null;
  private writeKind: "insert" | "update" | null = null;

  constructor(private readonly table: string) {}

  private get rows(): Row[] {
    tables[this.table] ??= [];
    return tables[this.table]!;
  }

  private readonly inFilters: Array<[string, unknown[]]> = [];

  private matches = (row: Row) =>
    this.filters.every(([column, value]) => row[column] === value) &&
    this.inFilters.every(([column, values]) => values.includes(row[column]));

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.inFilters.push([column, values]);
    return this;
  }

  ilike(column: string, value: string): this {
    this.filters.push([column, value]);
    return this;
  }

  insert(values: Row): this {
    this.writeKind = "insert";
    this.writeValues = values;
    return this;
  }

  upsert(values: Row): this {
    return this.insert(values);
  }

  update(values: Row): this {
    this.writeKind = "update";
    this.writeValues = values;
    return this;
  }

  private run(): Result {
    const values = this.writeValues;
    if (this.writeKind === "insert" && values) {
      if (this.table === "launcher_settings") {
        tables[this.table] = [values];
        return { data: values, error: null };
      }
      const existing = this.rows.find((row) => row["x_post_id"] === values["x_post_id"]);
      if (existing) return { data: existing, error: null };
      const row: Row = { id: `row-${this.rows.length + 1}`, ...values };
      this.rows.push(row);
      return { data: row, error: null };
    }
    if (this.writeKind === "update" && values) {
      const matched = this.rows.filter(this.matches);
      for (const row of matched) Object.assign(row, values);
      return { data: matched, error: null };
    }
    return { data: this.rows.filter(this.matches), error: null };
  }

  maybeSingle(): Promise<Result> {
    if (this.writeKind) {
      const result = this.run();
      const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
      return Promise.resolve({ data, error: null });
    }
    return Promise.resolve({ data: this.rows.find(this.matches) ?? null, error: null });
  }

  single(): Promise<Result> {
    return this.maybeSingle();
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => new FakeQuery(table) },
}));

const launchToken = vi.fn();
vi.mock("./launchpadAdapter", () => ({ launchpadAdapter: { launchToken: (...args: unknown[]) => launchToken(...args) } }));
vi.mock("./x-api.server", () => ({ readXCredentials: () => null, postReply: vi.fn() }));

const launchOnSuipump = vi.fn();
vi.mock("./suipump-launch.server", () => ({ launchOnSuipump: (...args: unknown[]) => launchOnSuipump(...args) }));

const {
  readDeployRequest,
  createLaunchRequest,
  executeLaunchRequest,
  composeReceivedReply,
  composeDeployedLaunchReply,
} = await import("./xLauncher.server");

describe("X mention → Suipump launch screen → verified result", () => {
  beforeEach(() => {
    tables["x_launch_requests"] = [];
    launchToken.mockReset();
    launchOnSuipump.mockReset();
  });

  it("reads a deploy request out of an @ourblastbot mention", async () => {
    const request = await readDeployRequest("Deploy $TETY Tety Yety Caty on Suipump @Ourblastbot");
    expect(request).toEqual({ symbol: "TETY", name: "Tety Yety Caty", launchpad: "suipump" });
  });

  it("falls back to Suipump when no launchpad is named", async () => {
    const request = await readDeployRequest("Deploy $TETY Tety Yety Caty @Ourblastbot");
    expect(request?.launchpad).toBe("suipump");
  });

  it("ignores tweets that are not launch calls", async () => {
    expect(await readDeployRequest("gm @Ourblastbot wen moon")).toBeNull();
  });

  it("creates one launch request per X post and shows launch-screen values", async () => {
    const request = (await readDeployRequest("Deploy $TETY Tety Yety Caty on Suipump @Ourblastbot"))!;
    const row = await createLaunchRequest("1801", "@WicWicz", request);

    expect(row.symbol).toBe("TETY");
    expect(row.name).toBe("Tety Yety Caty");
    expect(row.launchpad).toBe("suipump");
    expect(row.dev_buy).toBe(false);
    expect(row.ourblast_fee_percent).toBe(10);
    expect(row.status).toBe("PENDING");
    // Suipump is a wired launchpad now, so no "coming soon" notice is attached.
    expect(row.notice).toBeNull();

    // Duplicate protection: the same post never launches twice.
    const again = await createLaunchRequest("1801", "@WicWicz", request);
    expect(again.id).toBe(row.id);
    expect(tables["x_launch_requests"]).toHaveLength(1);
  });

  it("never says deployed in the received reply", async () => {
    const request = (await readDeployRequest("Deploy $TETY on Suipump"))!;
    const reply = composeReceivedReply(request);
    expect(reply).toContain("$TETY launch request received");
    expect(reply.toLowerCase()).not.toContain("deployed");
  });

  it("parks the launch when the launchpad is not connected yet", async () => {
    const request = (await readDeployRequest("Deploy $TETY Tety Yety Caty on Suipump"))!;
    const row = await createLaunchRequest("sim-1802", "WicWicz", request);
    launchOnSuipump.mockResolvedValue({ status: "NOT_IMPLEMENTED", message: "no ticket", tokenAddress: null, transactionDigest: null });

    const outcome = await executeLaunchRequest(row.id);
    expect(outcome.status).toBe("UNAVAILABLE");
    expect(outcome.notice).toBe("Launchpad integration coming soon.");
    expect(outcome.tokenUrl).toBeNull();
    expect(tables["x_launch_requests"]![0]!["status"]).toBe("UNAVAILABLE");
  });

  it("reports deployed only after an on-chain confirmation, with token and pool links", async () => {
    const request = (await readDeployRequest("Deploy $TETY Tety Yety Caty on Suipump"))!;
    const row = await createLaunchRequest("sim-1803", "WicWicz", request);
    launchOnSuipump.mockResolvedValue({
      status: "CONFIRMED",
      message: "live",
      tokenAddress: "0xabc123",
      transactionDigest: "DIGEST",
    });

    const outcome = await executeLaunchRequest(row.id);
    expect(outcome.status).toBe("DEPLOYED");
    expect(outcome.tokenUrl).toContain("0xabc123");
    expect(outcome.poolUrl).toContain("0xabc123");
    expect(tables["x_launch_requests"]![0]!["status"]).toBe("DEPLOYED");

    const reply = composeDeployedLaunchReply("TETY", outcome.tokenUrl!, outcome.poolUrl!);
    expect(reply).toContain("$TETY LIVE");
    expect(reply).toContain(outcome.tokenUrl!);
    expect(reply).toContain(outcome.poolUrl!);
  });

  it("includes the creator-fee claim link when one is available", () => {
    const reply = composeDeployedLaunchReply(
      "GUDSUI",
      "https://suipump.org/token/0xabc",
      "https://suipump.org/pool/0xabc",
      "claim-token-123",
      null,
      "mjbdran",
    );

    expect(reply).toContain("Creator fees designated to @mjbdran.");
    expect(reply).toContain("Creator fee share for @mjbdran:");
    expect(reply).toContain("https://ourblast.xyz/claim/claim-token-123");
  });
});

const { parseDeployTweet } = await import("./xLauncher");

describe("chatty tweets", () => {
  it("reads a launch call buried in conversation with a misspelled name marker", () => {
    const parsed = parseDeployTweet(
      "@Ourblastbot Hi clever pervert.. @Ourblastbot... Deploy a $Yety   nsme: Tety Yety Caty on Suipump",
    );
    expect(parsed).toEqual({ symbol: "YETY", name: "Tety Yety Caty", launchpad: "suipump" });
  });

  it("still ignores chatter without a cashtag", () => {
    expect(parseDeployTweet("@Ourblastbot wen moon ser")).toBeNull();
  });
});

it("parses 'deploy a ticker $X name token: Y'", () => {
  expect(parseDeployTweet("Deploy a ticker $Yety3 name token: Tety")).toEqual({
    symbol: "YETY3",
    name: "Tety",
    launchpad: "suipump",
  });
});

it("parses field-style tweets with cashtag on another line", () => {
  expect(
    parseDeployTweet("@Ourblastbot deploy a token on suipump\n\nName: THINKING CAT\nticker : $HMMM\nimage: https://t.co/abc"),
  ).toEqual({ symbol: "HMMM", name: "THINKING CAT", launchpad: "suipump" });
});

describe("perpsplexity launch calls", () => {
  it("reads ticker, name, underlying, position, leverage and MC from a field-style call", () => {
    const parsed = parseDeployTweet(
      "@Ourblastbot Launch Name: Tety Yety Caty, Ticker: $TETY, Underlying: NVDA, Position: LONG, Leverage: 5x Initial MC ~$4K on @perpsplexity",
    );
    expect(parsed?.symbol).toBe("TETY");
    expect(parsed?.name).toBe("Tety Yety Caty");
    expect(parsed?.launchpad).toBe("perpsplexity");
    expect(parsed?.perps).toEqual({ underlying: "NVDA", long: true, leverageBps: 50_000, startingCapUsd: 4000 });
  });

  it("reads the bare terminal style (NVDA LONG 5x) when the pad is perpsplexity", () => {
    const parsed = parseDeployTweet("@Ourblastbot deploy $TETY Tety Yety Caty NVDA LONG 5x on perpsplexity");
    expect(parsed?.symbol).toBe("TETY");
    expect(parsed?.launchpad).toBe("perpsplexity");
    expect(parsed?.perps?.underlying).toBe("NVDA");
    expect(parsed?.perps?.long).toBe(true);
    expect(parsed?.perps?.leverageBps).toBe(50_000);
  });

  it("does not treat 'LONG 5x' words as perps fields on suipump calls", () => {
    const parsed = parseDeployTweet("@Ourblastbot deploy $DOG Sui Dog on suipump");
    expect(parsed?.launchpad).toBe("suipump");
    expect(parsed?.perps ?? null).toBeNull();
  });

  it("keeps perps fields out of the token name", () => {
    const parsed = parseDeployTweet("@Ourblastbot deploy $TETY Tety Yety Caty Underlying: NVDA Position: SHORT Leverage: 2x on perps");
    expect(parsed?.name).toBe("Tety Yety Caty");
    expect(parsed?.perps?.long).toBe(false);
    expect(parsed?.perps?.leverageBps).toBe(20_000);
  });
});

describe("messy ticker labels", () => {
  it("reads the ticker when the value carries a stray prefix", () => {
    const parsed = parseDeployTweet(
      "@Ourblastbot deploy token, name : Purple Dark 4443, Ticker : u/PURPLE on Suipump https://t.co/zo6ko1E7z2",
    );
    expect(parsed?.symbol).toBe("PURPLE");
    expect(parsed?.name).toBe("Purple Dark 4443");
    expect(parsed?.launchpad).toBe("suipump");
  });
});

describe("launchpad after chatter", () => {
  it("finds the pad past an unrelated \"on <word>\" phrase", () => {
    const parsed = parseDeployTweet(
      "@Ourblastbot deploy $MOON Moon Cat, a bet on NVDA, Position: LONG, Leverage: 5x on Perpsplexity",
    );
    expect(parsed?.symbol).toBe("MOON");
    expect(parsed?.launchpad).toBe("perpsplexity");
  });

  it("still ignores chatter when no pad is named", () => {
    const parsed = parseDeployTweet("@Ourblastbot deploy $DOG Sui Dog on Monday");
    expect(parsed?.launchpad).toBe("suipump");
  });
});

describe("fee receiver in the tweet", () => {
  it("reads 'Set @adiniyi as fee receiver' and keeps the name and ticker", async () => {
    const { parseDeployTweet } = await import("./xLauncher");
    const request = parseDeployTweet(
      "Hay @OURBLASTBOT\n\nLaunch a token named Baldeniyi ticker $BALDENIYI,\n\nSet @adiniyi as fee receiver",
    );
    expect(request?.symbol).toBe("BALDENIYI");
    expect(request?.name).toBe("Baldeniyi");
    expect(request?.feeReceiver).toEqual({ handle: "adiniyi" });
  });

  it("reads a wallet fee receiver", async () => {
    const { parseDeployTweet } = await import("./xLauncher");
    const wallet = `0x${"a".repeat(64)}`;
    const request = parseDeployTweet(`deploy $DOG Sui Dog, fee receiver: ${wallet}`);
    expect(request?.symbol).toBe("DOG");
    expect(request?.feeReceiver?.wallet).toBe(wallet);
    expect(request?.name).toBe("Sui Dog");
  });

  it("leaves the fee receiver unset when the tweet does not name one", async () => {
    const { parseDeployTweet } = await import("./xLauncher");
    expect(parseDeployTweet("deploy $DOG Sui Dog")?.feeReceiver).toBeUndefined();
  });
});

describe("opening buy parsing", () => {
  it("reads a first buy amount and keeps it out of the token name", async () => {
    const { parseDeployTweet } = await import("./xLauncher");
    const request = parseDeployTweet("deploy $DOG Sui Dog on perpsplexity, first buy $25");
    expect(request?.symbol).toBe("DOG");
    expect(request?.name).toBe("Sui Dog");
    expect(request?.devBuyUsdc).toBe(25);
  });

  it("accepts dev buy and initial buy wording", async () => {
    const { extractDevBuy } = await import("./xLauncher");
    expect(extractDevBuy("dev buy 10 usdc")).toBe(10);
    expect(extractDevBuy("initial buy: 50")).toBe(50);
    expect(extractDevBuy("deploy $DOG Sui Dog")).toBeNull();
    expect(extractDevBuy("first buy 0")).toBeNull();
  });
});

describe("perpsplexity curve sizing", () => {
  it("leaves the seed out of the virtual quote and defaults to the 5,000 USDC cap", async () => {
    const { perpsCurveVirtualQuote, PERPSPLEXITY_CURVE_DEFAULT_CAP_UNITS, PERPSPLEXITY_CURVE_SEED_UNITS } =
      await import("./perpsplexity");
    expect(perpsCurveVirtualQuote(PERPSPLEXITY_CURVE_DEFAULT_CAP_UNITS)).toBe(
      PERPSPLEXITY_CURVE_DEFAULT_CAP_UNITS - PERPSPLEXITY_CURVE_SEED_UNITS,
    );
    expect(perpsCurveVirtualQuote(0n)).toBe(4_999_000_000n);
    expect(() => perpsCurveVirtualQuote(500_000n)).toThrow();
  });
});
