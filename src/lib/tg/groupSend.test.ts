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
