import { describe, expect, it } from "vitest";
import { mapPrivateSlash } from "./slashCommands";

describe("mapPrivateSlash", () => {
  it("bare command returns help, never runs", () => {
    expect(mapPrivateSlash("/send")).toHaveProperty("help");
    expect(mapPrivateSlash("/burn@ourblastsuibot")).toHaveProperty("help");
  });
  it("maps commands with arguments", () => {
    expect(mapPrivateSlash("/buy 5 sui $BLAST")).toEqual({ text: "buy 5 sui of $BLAST" });
    expect(mapPrivateSlash("/sell 50% $BLAST")).toEqual({ text: "sell 50% of $BLAST" });
    expect(mapPrivateSlash("/send 100 $BLAST to @bob")).toEqual({ text: "send 100 $BLAST to @bob" });
    expect(mapPrivateSlash("/burn 1000 $BLAST")).toEqual({ text: "send 1000 $BLAST to burn" });
    expect(mapPrivateSlash("/burn 2 sui of $BLAST")).toEqual({ text: "buy and burn 2 sui of $BLAST" });
  });
  it("refuses burning SUI", () => {
    expect(mapPrivateSlash("/burn 5 sui")).toHaveProperty("help");
  });
  it("ignores other text", () => {
    expect(mapPrivateSlash("buy 1 sui of $BLAST")).toBeNull();
  });
});
