// SPDX-License-Identifier: BUSL-1.1
/**
 * Read-only retry for Sui GraphQL: transient 429/5xx/network errors get up to
 * two retries (150ms, 300ms). Mutations (transaction submits) are never retried here.
 */
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

export async function fetchSuiGql(url: string, body: string, timeoutMs: number, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const isMutation = /^\s*mutation\b/.test((JSON.parse(body) as { query?: string }).query ?? "");
  const attempts = isMutation ? 1 : 3;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 150 * 2 ** (i - 1)));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "ourblast/1.0", ...extraHeaders },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (RETRY_STATUS.has(res.status) && i < attempts - 1) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Sui read failed.");
}
