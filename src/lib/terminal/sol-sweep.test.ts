// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

import { associatedTokenAddress, ATA_PROGRAM, planSolSweep, SOL_USDC_MINT, solTransferMessage, TOKEN_PROGRAM, usdcTransferMessage } from "./sol-sweep";

const A = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLwnzjKZqjpf";
const B = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const HASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";

describe("SOL sweep rules", () => {
  it("sweeps USDC first when SOL covers its fees", () => {
    expect(planSolSweep(3_000_000n, 5_000_000n)).toEqual({ token: "USDC", amount: 5_000_000n });
  });
  it("needs at least 2 USDC", () => {
    expect(planSolSweep(3_000_000n, 1_999_999n)).toBeNull();
  });
  it("sweeps all SOL minus the network fee from 0.02 SOL", () => {
    expect(planSolSweep(20_000_000n, 0n)).toEqual({ token: "SOL", amount: 19_995_000n });
    expect(planSolSweep(19_999_999n, 0n)).toBeNull();
  });
  it("skips USDC without SOL for fees", () => {
    expect(planSolSweep(1_000_000n, 50_000_000n)).toBeNull();
  });
});

describe("Solana transaction building matches web3.js", () => {
  it("derives the associated token address", () => {
    const [ata] = PublicKey.findProgramAddressSync(
      [new PublicKey(A).toBuffer(), new PublicKey(TOKEN_PROGRAM).toBuffer(), new PublicKey(SOL_USDC_MINT).toBuffer()],
      new PublicKey(ATA_PROGRAM),
    );
    expect(associatedTokenAddress(A, SOL_USDC_MINT)).toBe(ata.toBase58());
  });
  it("serializes a SOL transfer identically", () => {
    const tx = new Transaction({ feePayer: new PublicKey(A), recentBlockhash: HASH }).add(
      SystemProgram.transfer({ fromPubkey: new PublicKey(A), toPubkey: new PublicKey(B), lamports: 123_456_789 }),
    );
    expect(Buffer.from(solTransferMessage(A, B, 123_456_789n, HASH)).toString("hex")).toBe(tx.serializeMessage().toString("hex"));
  });
  it("builds a USDC message with 8 accounts and 2 instructions", () => {
    const m = usdcTransferMessage(A, B, 5_000_000n, HASH);
    expect([m[0], m[1], m[2], m[3]]).toEqual([1, 0, 5, 8]);
  });
});
