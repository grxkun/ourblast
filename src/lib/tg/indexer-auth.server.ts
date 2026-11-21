// SPDX-License-Identifier: BUSL-1.1
import { timingSafeEqual } from "node:crypto";
export function indexerAuthorized(supplied: string | null, secrets: (string | undefined)[]): boolean {
  if (!supplied || supplied.length > 256) return false;
  const input = new TextEncoder().encode(supplied);
  return secrets.some((secret) => {
    if (!secret) return false;
    const expected = new TextEncoder().encode(secret);
    return input.length === expected.length && timingSafeEqual(input, expected);
  });
}