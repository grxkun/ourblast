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

  private matches = (row: Row) => this.filters.every(([column, value]) => row[column] === value);

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
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
      for (const row of this.rows) if (this.matches(row)) Object.assign(row, values);
      return { data: this.rows.filter(this.matches), error: null };
    }
    return { data: this.rows.filter(this.matches), error: null };
  }

  maybeSingle(): Promise<Result> {
    if (this.writeKind) return Promise.resolve(this.run());
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
    expect(row.notice).toBe("Launchpad integration coming soon.");

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
    launchToken.mockResolvedValue({ tool: "launchToken", status: "NOT_IMPLEMENTED", message: "no factory" });

    const outcome = await executeLaunchRequest(row.id);
    expect(outcome.status).toBe("UNAVAILABLE");
    expect(outcome.notice).toBe("Launchpad integration coming soon.");
    expect(outcome.tokenUrl).toBeNull();
    expect(tables["x_launch_requests"]![0]!["status"]).toBe("UNAVAILABLE");
  });

  it("reports deployed only after an on-chain confirmation, with token and pool links", async () => {
    const request = (await readDeployRequest("Deploy $TETY Tety Yety Caty on Suipump"))!;
    const row = await createLaunchRequest("sim-1803", "WicWicz", request);
    launchToken.mockResolvedValue({
      tool: "launchToken",
      status: "CONFIRMED",
      message: "live",
      data: { deployment: { tokenAddress: "0xabc123", transactionDigest: "DIGEST" } },
    });

    const outcome = await executeLaunchRequest(row.id);
    expect(outcome.status).toBe("DEPLOYED");
    expect(outcome.tokenUrl).toContain("0xabc123");
    expect(outcome.poolUrl).toContain("0xabc123");
    expect(tables["x_launch_requests"]![0]!["status"]).toBe("DEPLOYED");

    const reply = composeDeployedLaunchReply("TETY", outcome.tokenUrl!, outcome.poolUrl!);
    expect(reply).toContain("$TETY deployed!");
    expect(reply).toContain(outcome.tokenUrl!);
    expect(reply).toContain(outcome.poolUrl!);
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
