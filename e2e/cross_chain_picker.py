# SPDX-License-Identifier: BUSL-1.1
# Browser test: buy popup lets users expand "+2 chains" and pick HyperEVM and Monad.
# Run with the dev server up: python3 e2e/cross_chain_picker.py
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        pg = await (await b.new_context(viewport={"width": 1280, "height": 1800})).new_page()
        await pg.goto("http://localhost:8080", wait_until="domcontentloaded")
        await pg.wait_for_timeout(5000)
        await pg.get_by_role("button", name="BUY WITH ETH / SOL").first.click()
        # Wait until the Mayan widget is fully rendered: the origin amount input
        # only appears once the swap form (incl. the chain selector) is ready.
        await pg.locator("#mayan-originFormInput").wait_for(state="visible", timeout=60000)
        root = pg.locator("#mayan-widget-root")
        # Open the source-chain picker via the current chain label inside the widget.
        await root.get_by_text("Ethereum", exact=True).first.click()
        await pg.get_by_text("+2 chains", exact=True).wait_for(state="visible", timeout=15000)
        await pg.get_by_text("+2 chains", exact=True).click()
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path="/tmp/xchain_expanded.png")
        results = {}
        for name, token in [("HyperEVM", "HYPE"), ("Monad", "MON")]:
            item = pg.get_by_text(name, exact=True).last  # the entry inside the open "All Chains" list
            await item.wait_for(state="visible", timeout=15000)
            results[name + " visible"] = True
            await item.click()
            await pg.wait_for_timeout(2000)
            # Selecting a chain closes "All Chains" and puts it on the picker's chain row.
            closed = not await pg.get_by_text("All Chains", exact=True).is_visible()
            shown = await root.get_by_text(name, exact=True).first.is_visible()
            results[name + " selected"] = closed and shown and await root.get_by_text(token, exact=True).first.is_visible()
            print("RESULT", name, results[name + " visible"], results[name + " selected"], flush=True)
            await pg.screenshot(path=f"/tmp/xchain_{name}.png")
            if name == "HyperEVM":
                await root.get_by_text(name, exact=True).first.click()
                await pg.get_by_text("+2 chains", exact=True).wait_for(state="visible", timeout=15000)
                await pg.get_by_text("+2 chains", exact=True).click()
                await pg.wait_for_timeout(1500)
        assert all(results.values()), results
        print("PASS")
        await b.close()

asyncio.run(main())
