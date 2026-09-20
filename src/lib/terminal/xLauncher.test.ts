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

function makeQuery(table: string) {
  const filters: Array<[string, unknown]> = [];
  let pending: { kind: "select" } | { kind: "insert"; values: Row } | { kind: "update"; values: Row } = {
    kind: "select",
  };

  const matches = (row: Row) => filters.every(([column, value]) => row[column] === value);

  const query: Record<string, unknown> = {
    select() {
      return query;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return query;
    },
    insert(values: Row) {
      pending = { kind: "insert", values };
      return query;
    },
    upsert(values: Row) {
      pending = { kind: "insert", values };
      return query;
    },
    update(values: Row) {
      pending = { kind: "update", values };
      return query;
    },
    maybeSingle() {
      return Promise.resolve({ data: tables[table]?.find(matches) ?? null, error: null });
    },
    single() {
      return query.maybeSingle!.call(query) as Promise<unknown>;
    },
    then(resolve: (value: { data: unknown; error: null }) => unknown) {
      if (pending.kind === "insert") {
        const existing = tables[table]!.find((row) => row["x_post_id"] === pending.values["x_post_id"]);
        if (existing && table === "x_launch_requests") {
          return Promise.resolve({ data: existing, error: null }).then(resolve);
        }
        const row = { id: `row-${tables[table]!.length + 1}`, ...pending.values };
        if (table === "launcher_settings") tables[table] = [pending.values];
        else tables[table]!.push(row);
        return Promise.resolve({ data: row, error: null }).then(resolve);
      }
      if (pending.kind === "update") {
        for (const row of tables[table]!) if (matches(row)) Object.assign(row, pending.values);
      }
      return Promise.resolve({ data: tables[table]?.filter(matches) ?? [], error: null }).then(resolve);
    },
  };

  // insert/upsert/update chains end in .select().single() — make those await the write.
  const writeAware = new Proxy(query, {
    get(target, prop) {
      if (prop === "single" || prop === "maybeSingle") {
        if (pending.kind !== "select") {
          return () => (target["then"] as (r: (v: unknown) => unknown) => Promise<unknown>)((v) => v);
        }
      }
      return target[prop as string];
    },
  });
  return writeAware;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => makeQuery(table) },
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
