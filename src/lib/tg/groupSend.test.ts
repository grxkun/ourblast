import { describe, it, expect } from "vitest";
import { parseGroupSend } from "./groupSend";

describe("parseGroupSend", () => {
  it("handles mention + recipient first", () => {
    expect(parseGroupSend("@ourblastsuibot send @John_Gibb 100 $BLAST")).toEqual({ tgUsername: "John_Gibb", amount: "100", token: "BLAST" });
  });
  it("handles /send … to @user", () => {
    expect(parseGroupSend("/send@ourblastsuibot 1 blast to @John_Gibb")).toEqual({ tgUsername: "John_Gibb", amount: "1", token: "BLAST" });
  });
  it("reply form has no username", () => {
    expect(parseGroupSend("/tip 5 sui")).toEqual({ tgUsername: null, amount: "5", token: "SUI" });
  });
  it("ignores messages not addressed to the bot", () => {
    expect(parseGroupSend("send @John_Gibb 100 BLAST")).toBeNull();
  });
});

import { describe as d2, it as i2, expect as e2 } from "vitest";
import { parseGroupSend as p2 } from "./groupSend";
d2("group send to sui name / address", () => {
  i2("parses .sui name", () => {
    e2(p2("@ourblastsuibot send 1 BLAST to crypt-willie.sui")).toEqual({ amount: "1", token: "BLAST", tgUsername: null, address: "crypt-willie.sui" });
  });
  i2("parses 0x address", () => {
    const a = "0x9763dd47856ff882bc943c28b31412d7dd24594160fcdbd7f0614e648295e11a";
    e2(p2(`@ourblastsuibot send 1 BLAST to ${a}`)?.address).toBe(a);
  });
});
