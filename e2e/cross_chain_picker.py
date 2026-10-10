# SPDX-License-Identifier: BUSL-1.1
# Browser test: buy popup's source-chain picker shows HyperEVM and Monad,
# and both are selectable (chain + token land on the Sell selector).
# Run with the dev server up: python3 e2e/cross_chain_picker.py
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        pg = await (await b.new_context(viewport={"width": 1280, "height": 1800})).new_page()
        await pg.goto("http://localhost:8080", wait_until="domcontentloaded")
        await pg.wait_for_timeout(5000)
        # Open the popup and wait for the widget; retry once if the CDN script is slow.
        for attempt in range(3):
            await pg.get_by_role("button", name="BUY WITH ETH / SOL").first.click()
            try:
                await pg.wait_for_function("!!window.MayanSwap", timeout=30000)
                # Wait until the Mayan widget is fully rendered: the origin amount
                # input only appears once the swap form (incl. chain selector) is ready.
                await pg.locator("#mayan-originFormInput").wait_for(state="visible", timeout=45000)
                break
            except Exception:
                if attempt == 2:
                    raise
                await pg.keyboard.press("Escape")
                await pg.wait_for_timeout(2000)
        root = pg.locator("#mayan-widget-root")

        results = {}
        for name, token in [("HyperEVM", "HYPE"), ("Monad", "MON")]:
            # Open the source-chain picker via the current chain label inside the widget.
            current = "Ethereum" if name == "HyperEVM" else "HyperEVM"
            await root.get_by_text(current, exact=True).first.click()
            # The Sell picker grid shows ~8 chains; the rest sit behind "+2 chains".
            # The grid composition varies, so expand "+2 chains" when the tile isn't shown.
            tile = pg.get_by_text(name, exact=True).last
            if not await tile.is_visible():
                more = pg.get_by_text("+2 chains", exact=True)
                await more.wait_for(state="visible", timeout=15000)
                await more.click()
                await pg.wait_for_timeout(1500)
                tile = pg.get_by_text(name, exact=True).last
            try:
                await tile.wait_for(state="visible", timeout=15000)
            except Exception:
                await pg.screenshot(path=f"/tmp/xchain_debug_{name}.png")
                raise
            results[name + " visible"] = True
            await tile.click()
            # Picking a chain opens its token list; choose the native token to finish selection.
            tok = pg.get_by_text(token, exact=True).first
            await tok.wait_for(state="visible", timeout=15000)
            await tok.click()
            # After selection the picker's MuiDialog modal closes and the Sell
            # selector shows chain + token. (Both the chain grid and the token
            # list have a search input, so track the modal itself.)
            modal = pg.locator("div.MuiDialog-root")
            await modal.wait_for(state="hidden", timeout=15000)
            await pg.wait_for_timeout(1000)
            closed = not await modal.is_visible()
            shown = await root.get_by_text(name, exact=True).first.is_visible()
            token_shown = await root.get_by_text(token, exact=True).first.is_visible()
            results[name + " selected"] = closed and shown and token_shown
            print("RESULT", name, results[name + " visible"], results[name + " selected"], flush=True)
            await pg.screenshot(path=f"/tmp/xchain_{name}.png")
            if name == "HyperEVM":
                # Reopen the picker for the next chain. The token-search modal can
                # linger and intercept clicks, so wait for it to fully close first.
                await pg.locator("input[placeholder='Search name or paste address']").wait_for(state="hidden", timeout=15000)
                await pg.wait_for_timeout(1000)
                await root.get_by_text(name, exact=True).first.click()
                await pg.wait_for_timeout(1500)
        assert all(results.values()), results
        print("PASS")
        await b.close()

asyncio.run(main())
