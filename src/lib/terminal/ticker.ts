/**
 * Reads a usable ticker out of whatever people type after "Ticker:".
 * Real tweets carry stray prefixes ("Ticker : u/PURPLE", "Ticker: $/PURPLE"),
 * so the meaningful part is the longest letters-and-digits run in the value.
 */
export function normalizeSymbol(value?: string | null): string {
  const parts = (value ?? "").toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  let best = "";
  for (const part of parts) if (part.length > best.length) best = part;
  return best.length >= 2 ? best.slice(0, 10) : "";
}
