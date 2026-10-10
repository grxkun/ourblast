"""E2E: MetaMask sign-in -> cross-chain popup -> OurBank address for auto-swap.
Uses a fake injected EVM provider (fresh random key) — no real funds, no bridge, no swap.
Bridging/swap are covered by unit tests (crossChain.test.ts) since they need mainnet funds."""
import asyncio, json, os, subprocess, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8080")
OUT = Path("/tmp/browser/evm"); OUT.mkdir(parents=True, exist_ok=True)
PRIV = os.urandom(32).hex()
ROOT = Path(__file__).resolve().parent.parent

def sign(msg):
    return json.loads(subprocess.check_output(["bun", "e2e/evm_sign.ts", PRIV, msg], cwd=ROOT))

PROVIDER = """
window.ethereum = { isMetaMask: true, request: async ({method, params}) => {
  if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [await window.__evmAddr()];
  if (method === 'personal_sign') return await window.__evmSign(params[0]);
  throw new Error('unsupported ' + method);
}};"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 1280, "height": 1800})
        await ctx.expose_function("__evmAddr", lambda: sign("x")["addr"])
        await ctx.expose_function("__evmSign", lambda m: sign(m)["sig"])
        await ctx.add_init_script(PROVIDER)
        page = await ctx.new_page()
        await page.goto(f"{BASE}/terminal", wait_until="networkidle")
        await page.get_by_role("button", name="MetaMask / Rabby").click()
        await page.get_by_role("button", name="Sign out").wait_for(timeout=30000)
        print("signed in as", sign("x")["addr"])
        await page.goto(BASE, wait_until="networkidle")
        await page.get_by_role("button", name="BUY WITH ETH / SOL").first.click()
        await page.get_by_role("button", name="Get my address + auto-swap").click()
        addr = page.get_by_role("button", name="tap to copy")
        await addr.wait_for(timeout=30000)
        text = await addr.inner_text()
        await page.screenshot(path=str(OUT / "oneshot.png"))
        ok = text.startswith("0x") and await page.get_by_text("Waiting for your SUI").is_visible()
        print("ourbank address:", text.split()[0], "| waiting state:", ok)
        await b.close()
        sys.exit(0 if ok else 1)

asyncio.run(main())
