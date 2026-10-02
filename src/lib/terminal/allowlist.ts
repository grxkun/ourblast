// SPDX-License-Identifier: BUSL-1.1
/**
 * Private-testing allowlist for the OURBLAST Terminal.
 *
 * Only these wallet addresses can open the terminal while it is in testing.
 * Add or remove addresses here — matching is case-insensitive.
 */
export const TERMINAL_ALLOWED_WALLETS: readonly string[] = [
  "0x46e562648fda7c6dc3d779c059943c2f03a890dbd0d4a6ea02e29891a1332b5a",
  // Owner / admin account
  "0x5072270dc6285923416008d93923cfae1cf8236b72ac8d101692335e139b4886",
];

export function isTerminalAllowed(address?: string | null): boolean {
  if (!address) return false;
  const normalized = address.trim().toLowerCase();
  return TERMINAL_ALLOWED_WALLETS.some((entry) => entry.toLowerCase() === normalized);
}
