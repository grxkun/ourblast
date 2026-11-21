// SPDX-License-Identifier: BUSL-1.1
/** /chart parsing (pure). "/chart <ca|$TICKER> [1m|5m|15m|1h|4h|1d]", alias /c. */
export const CHART_TFS: Record<string, { tf: "minute" | "hour" | "day"; agg: number }> = {
  "1m": { tf: "minute", agg: 1 }, "5m": { tf: "minute", agg: 5 }, "15m": { tf: "minute", agg: 15 },
  "1h": { tf: "hour", agg: 1 }, "4h": { tf: "hour", agg: 4 }, "1d": { tf: "day", agg: 1 },
};
export const DEFAULT_TF = "15m";

export function parseChartCmd(text: string): { target: string | null; tf: string } | null {
  const m = text.trim().match(/^\/(?:chart|c)(?:@\w+)?(?:\s+(\S+))?(?:\s+(\S+))?\s*$/i);
  if (!m) return null;
  let target = m[1] ?? null;
  let tf = (m[2] ?? DEFAULT_TF).toLowerCase();
  // Allow "/chart 1h $BLAST" too.
  if (target && CHART_TFS[target.toLowerCase()] && m[2]) { tf = target.toLowerCase(); target = m[2]; }
  if (!CHART_TFS[tf]) tf = DEFAULT_TF;
  return { target, tf };
}
