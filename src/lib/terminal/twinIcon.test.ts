import { describe, expect, it, vi, beforeEach } from "vitest";
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
class Q implements PromiseLike<any> {
  f: Array<[string, any]> = []; inF: Array<[string, any[]]> = []; wv: Row | null = null; wk: "insert"|"update"|null = null;
  constructor(private t: string) {}
  get rows() { tables[this.t] ??= []; return tables[this.t]!; }
  m = (r: Row) => this.f.every(([c,v]) => r[c] === v) && this.inF.every(([c,v]) => v.includes(r[c]));
  select() { return this; }
  eq(c: string, v: any) { this.f.push([c,v]); return this; }
  in(c: string, v: any[]) { this.inF.push([c,v]); return this; }
  ilike(c: string, v: any) { return this.eq(c,v); }
  insert(v: Row) { this.wk = "insert"; this.wv = v; return this; }
  upsert(v: Row) { return this.insert(v); }
  update(v: Row) { this.wk = "update"; this.wv = v; return this; }
  run(): any {
    const v = this.wv;
    if (this.wk === "insert" && v) {
      if (this.t === "launcher_settings") { tables[this.t] = [v]; return { data: v, error: null }; }
      const ex = this.rows.find(r => r["x_post_id"] === v["x_post_id"]);
      if (ex) return { data: ex, error: null };
      const row = { id: `row-${this.rows.length+1}`, created_at: new Date(Date.now()+this.rows.length*1000).toISOString(), ...v };
      this.rows.push(row); return { data: row, error: null };
    }
    if (this.wk === "update" && v) { const m = this.rows.filter(this.m); for (const r of m) Object.assign(r, v); return { data: m, error: null }; }
    return { data: this.rows.filter(this.m), error: null };
  }
  maybeSingle(): Promise<any> { if (this.wk) { const r = this.run(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return Promise.resolve({data:d,error:null}); } return Promise.resolve({ data: this.rows.find(this.m) ?? null, error: null }); }
  single(): Promise<any> { return this.maybeSingle(); }
  then<T1 = any, T2 = never>(a?: any, b?: any): PromiseLike<T1 | T2> { return Promise.resolve(this.run()).then(a, b) as PromiseLike<T1 | T2>; }
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (t: string) => new Q(t) } }));

const { createLaunchRequest, readDeployRequest } = await import("@/lib/terminal/xLauncher.server");

describe("twin image merge", () => {
  beforeEach(() => { tables["x_launch_requests"] = []; tables["launcher_settings"] = []; });
  it("borrows the picture from the twin post of the same launch call", async () => {
    const req = (await readDeployRequest("Deploy $TWIN Twin Coin on Suipump"))!;
    const withImage = await createLaunchRequest("5001", "grxxxkun", req, "https://pbs.twimg.com/media/real.jpg", "t");
    expect(withImage.icon_url).toBe("https://pbs.twimg.com/media/real.jpg");
    const blind = await createLaunchRequest("5002", "grxxxkun", req, null, "t");
    expect(blind.icon_url).toBe("https://pbs.twimg.com/media/real.jpg");
  });
  it("backfills an existing image-less row", async () => {
    const req = (await readDeployRequest("Deploy $BACK Back Coin on Suipump"))!;
    const blind = await createLaunchRequest("6001", "grxxxkun", req, null, "t");
    expect(blind.icon_url).toBeNull();
    await createLaunchRequest("6002", "grxxxkun", req, "https://pbs.twimg.com/media/later.jpg", "t");
    const again = await createLaunchRequest("6001", "grxxxkun", req, null, "t");
    expect(again.icon_url).toBe("https://pbs.twimg.com/media/later.jpg");
  });
});
