// SPDX-License-Identifier: BUSL-1.1
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyInitData } from "./initData";

const TOKEN = "123:abc";
function sign(fields: Record<string, string>) {
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
const now = 1_800_000_000;
const fields = { auth_date: String(now - 10), user: JSON.stringify({ id: 42, first_name: "Ann" }) };

describe("verifyInitData", () => {
  it("accepts a correctly signed payload", async () => {
    expect((await verifyInitData(sign(fields), TOKEN, 86400, now))?.id).toBe(42);
  });
  it("rejects a tampered user", async () => {
    const bad = sign(fields).replace("42", "43");
    expect(await verifyInitData(bad, TOKEN, 86400, now)).toBeNull();
  });
  it("rejects payloads older than 24h", async () => {
    expect(await verifyInitData(sign(fields), TOKEN, 86400, now + 90000)).toBeNull();
  });
});
