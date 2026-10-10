# SPDX-License-Identifier: BUSL-1.1
# Browser test: buy popup lets users expand "+2 chains" and pick HyperEVM and Monad.
# Run with the dev server up: python3 e2e/cross_chain_picker.py
import asyncio, re
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(headless=True)
        pg=await (await b.new_context(viewport={"width":1280,"height":1800})).new_page()
        await pg.goto("http://localhost:8080",wait_until="domcontentloaded"); await pg.wait_for_timeout(5000)
        await pg.get_by_role("button",name="BUY WITH ETH / SOL").first.click()
        await pg.wait_for_timeout(5000)
        await pg.locator("#mayan-widget-root").get_by_text("Ethereum").first.click()
        await pg.wait_for_timeout(2000)
        await pg.get_by_text("+2 chains", exact=True).click()
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path="/tmp/xchain_expanded.png")
        results={}
        for name in ["HyperEVM","Monad"]:
            item=pg.get_by_text(name, exact=True).first
            results[name+" visible"]=await item.is_visible()
            await item.click()
            await pg.wait_for_timeout(1500)
            txt=await pg.locator("#mayan-widget-root").inner_text()
            results[name+" selected"]=name in txt
            await pg.screenshot(path=f"/tmp/xchain_{name}.png")
            await pg.locator("#mayan-widget-root").get_by_text(name).first.click()
            await pg.wait_for_timeout(1500)
            more=pg.get_by_text("+2 chains", exact=True)
            if await more.count(): await more.click(); await pg.wait_for_timeout(1000)
        for k,v in results.items(): print("RESULT",k,v)
        assert all(results.values()), results
        print("PASS")
        await b.close()
asyncio.run(main())
