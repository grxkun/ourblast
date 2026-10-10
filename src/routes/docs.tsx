import { Link, createFileRoute } from "@tanstack/react-router";

import { SectionTitle } from "@/components/blast/AppShell";
import { LAUNCHPADS } from "@/lib/terminal/launchpad";
import {
  PERPSPLEXITY_CURVE_DEFAULT_CAP_USD,
  PERPSPLEXITY_CURVE_QUOTE_SYMBOL,
  PERPSPLEXITY_DEV_BUY_PRESETS,
  PERPSPLEXITY_MARKETS,
} from "@/lib/terminal/perpsplexity";
import { CREATOR_FEE_ROUTES, LAUNCHER_SHARE_USES } from "@/lib/terminal/fees";
import { formatSui, launchFeeMist, requiredBalanceMist } from "@/lib/terminal/launchFee";

const BOT_HANDLE = "@Ourblastbot";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs — Commands, Launch Fees & Perps Markets | OURBLAST" },
      {
        name: "description",
        content:
          "Full OURBLAST documentation: terminal and @Ourblastbot command syntax, launchpad options, Perpsplexity leveraged markets, OurBank wallet, creator fees and launch costs.",
      },
      { property: "og:title", content: "OURBLAST Docs — Every Command in One Place" },
      {
        property: "og:description",
        content:
          "Learn how to launch, trade, send and claim on Sui by chat or by tagging @Ourblastbot on X.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Docs,
});

const TOC = [
  { id: "start", label: "Getting started" },
  { id: "x", label: "X commands" },
  { id: "ourbank", label: "OurBank wallet" },
  { id: "launch", label: "Launching a token" },
  { id: "perps", label: "Leveraged (Perpsplexity)" },
  { id: "fees", label: "Launch cost" },
  { id: "trade", label: "Trading & sending" },
  { id: "escrow", label: "OTC escrow" },
  { id: "crosschain", label: "Buy from any chain" },
  { id: "evm-x", label: "EVM accounts on X" },
  { id: "claim", label: "Creator fees" },
  { id: "pads", label: "Launchpads" },
  { id: "matrix", label: "Fee matrix" },
  { id: "markets", label: "Perps markets" },
  { id: "blast", label: "$BLAST & arcade" },
  { id: "faq", label: "FAQ" },
] as const;

function Cmd({ children }: { children: string }) {
  return (
    <code className="block overflow-x-auto rounded-lg border border-border bg-secondary/40 px-3 py-2 font-mono text-[0.8rem] whitespace-pre-wrap text-foreground">
      {children}
    </code>
  );
}

function Block({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <SectionTitle kicker={kicker} title={title} />
      <div className="space-y-4 font-body text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function Docs() {
  const pads = LAUNCHPADS.filter((pad) => pad.integrated);
  const soon = LAUNCHPADS.filter((pad) => !pad.integrated);

  return (
    <div className="space-y-12">
      <section className="panel px-5 py-9 sm:px-9">
        <p className="font-body text-xs font-bold tracking-[0.22em] text-primary uppercase">
          Documentation
        </p>
        <h1 className="mt-2 font-display text-[clamp(2.2rem,7vw,4rem)] leading-[0.9] uppercase">
          How <span className="text-primary">OURBLAST</span> works
        </h1>
        <p className="mt-4 max-w-2xl font-body text-base text-muted-foreground">
          Everything the terminal and {BOT_HANDLE} can do, written out: the exact words to type,
          what each launch costs, and which leveraged markets you can pair a coin with.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {TOC.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="rounded-full border border-border px-3 py-1.5 font-body text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </div>
      </section>

      <Block id="start" kicker="Step one" title="Getting started">
        <p>
          There are two ways to use OURBLAST, and they do exactly the same things:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">The terminal</strong> — the chat box on the{" "}
            <Link to="/" className="text-primary underline">
              home page
            </Link>
            . Type a command, confirm the card that appears.
          </li>
          <li>
            <strong className="text-foreground">X</strong> — tag{" "}
            <a
              href="https://x.com/Ourblastbot"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              {BOT_HANDLE}
            </a>{" "}
            in a post. The bot reads it, runs it and replies with the result.
          </li>
        </ul>
        <p>
          You do not need perfect wording. Write it naturally and the bot works out what you meant;
          if something is missing it replies with the exact line to post.
        </p>
        <p>
          Sign in once on the home page and link your X account so posts from your handle are
          matched to your wallet.
        </p>
      </Block>

      <Block id="x" kicker="Cheat sheet" title="What you can post on X">
        <p>
          Tag {BOT_HANDLE} in a post with any of the lines below — write it naturally, the bot
          reads the meaning. Amounts with commas are fine (10,000 works). Every one of these also
          works in the terminal word-for-word.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] border-collapse text-left font-body text-sm">
            <thead className="bg-secondary/40 text-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">What you want</th>
                <th className="px-4 py-2.5 font-semibold">Post this</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Launch a token", `launch $MYCOIN, My Coin on suipump, description: your pitch`],
                ["Attach the coin picture", "attach the image to the same post — it becomes the icon"],
                ["Leveraged launch", "launch on Perpsplexity, $MYCOIN, My Coin, SAMSUNG, Long 3x, Dev buy 5 USDC"],
                ["Buy a token", "buy me 0xTOKEN_ADDRESS with 1 SUI"],
                ["Buy and burn", "buy and burn 1 SUI of 0xTOKEN_ADDRESS"],
                ["Sell", "sell 50% 0xTOKEN_ADDRESS"],
                ["Send to someone", "send 5 SUI to @friendhandle (or name.sui, or 0xADDRESS)"],
                ["Check your balance", "balance (or: my balance, check my wallet)"],
                ["OTC escrow", "escrow with @friend 10 SUI for 50000 $BLAST"],
                ["Cancel an escrow", "cancel escrow #12"],
                ["Check pending fees", "check fees on $MYCOIN"],
                ["Claim your fees", "claim my fees on $MYCOIN"],
                ["Anything else", "help — the bot replies with the exact line to post"],
              ].map(([want, say]) => (
                <tr key={want} className="border-t border-border">
                  <td className="px-4 py-2.5 align-top font-semibold text-foreground">{want}</td>
                  <td className="px-4 py-2.5 font-mono text-[0.78rem] whitespace-pre-wrap">{say}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Start each post with <em>{BOT_HANDLE}</em>. Manage your OurBank wallet — balances, top-up
          and fee routing — at{" "}
          <Link to="/terminal" className="text-primary underline">
            ourblast.xyz/terminal
          </Link>
          . If the bot can't read a line it answers with the exact missing piece, so you can fix and
          resend.
        </p>
      </Block>

      <Block id="ourbank" kicker="Your money" title="The OurBank wallet">
        <p>
          Every account gets an OurBank wallet. It pays your fees, funds your first buys and
          receives your tokens. Keys live inside hardware-isolated secure enclaves (Turnkey, running
          in AWS Nitro) — they are never shown, exported or logged, and signing only happens for a
          command you sent. No plain-text key ever leaves the enclave.
        </p>
        <p>Open the OurBank card in the terminal to create your wallet, see balances and top up.</p>
        <Cmd>show my wallet</Cmd>
        <Cmd>my balances</Cmd>
      </Block>

      <Block id="launch" kicker="Launching" title="Launching a token">
        <p>Minimum you need: a ticker and a name. Everything else has a default.</p>
        <Cmd>{`${BOT_HANDLE} launch $MYCOIN, My Coin`}</Cmd>
        <p>Pick the launchpad, add a description, attach a picture to the post for the token icon:</p>
        <Cmd>{`${BOT_HANDLE} launch on Blast.fun, $MYCOIN, My Coin, Description: the friendliest coin on Sui`}</Cmd>
        <p>
          On Maelstrom you can also choose what the pool is paired against (SUI by default):
        </p>
        <Cmd>{`${BOT_HANDLE} launch on Maelstrom, $MYCOIN, My Coin, pair USDC`}</Cmd>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>One launch per post — reposting the same post will not launch twice.</li>
          <li>
            The picture attached to your post becomes the coin icon. It is baked in permanently at
            creation, so attach the right image before posting.
          </li>
          <li>
            The bot only announces a launch after the blockchain confirms it, and the reply carries
            the live token and pool links.
          </li>
        </ul>
      </Block>

      <Block id="perps" kicker="Leveraged" title="Coins backed by a leveraged position">
        <p>
          Perpsplexity launches pair your coin with a leveraged position on a real market — a stock,
          an index, a metal or a crypto asset. Trading is denominated in{" "}
          {PERPSPLEXITY_CURVE_QUOTE_SYMBOL}.
        </p>
        <Cmd>{`${BOT_HANDLE} launch on Perpsplexity, $NVDL, Nvidia Long, NVDA, Long 3x, Dev buy 25 USDC, Description: leveraged nvidia`}</Cmd>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">Market</strong> — any name from the list below
            (NVDA, SAMSUNG, BYD, QNT, BTC…).
          </li>
          <li>
            <strong className="text-foreground">Direction and leverage</strong> — Long or Short,
            from 1x up to 10x.
          </li>
          <li>
            <strong className="text-foreground">Starting market cap</strong> — $
            {PERPSPLEXITY_CURVE_DEFAULT_CAP_USD.toLocaleString()} by default.
          </li>
          <li>
            <strong className="text-foreground">Dev buy</strong> — optional first buy in{" "}
            {PERPSPLEXITY_CURVE_QUOTE_SYMBOL}, off unless you ask for it. Common sizes:{" "}
            {PERPSPLEXITY_DEV_BUY_PRESETS.filter((n) => n > 0).join(", ")} USDC.
          </li>
        </ul>
        <p>
          Your dev buy is paid from your own OurBank wallet and the position lands in your wallet.
          It rides inside the very same blockchain transaction that opens the pool — the pool
          opening and your first buy are one atomic step, so no sniper can buy ahead of you, no
          matter how fast they are. If the launch fails at any point, that money is sent straight
          back to you.
        </p>
      </Block>

      <Block id="fees" kicker="Cost" title="What a launch costs">
        <p>
          Launching charges a small fee from your OurBank wallet before anything is created. This
          keeps spam out and keeps the bot funded.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-left font-body text-sm">
            <thead className="bg-secondary/40 text-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Launch type</th>
                <th className="px-4 py-2.5 font-semibold">Fee</th>
                <th className="px-4 py-2.5 font-semibold">Balance needed</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Suipump", "suipump"],
                ["POPULAR, RIPT", "popular"],
                ["Maelstrom, Blast.fun", "maelstrom"],
                ["Perpsplexity (leveraged)", "perpsplexity"],
              ].map(([label, id]) => (
                <tr key={id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-foreground">{label}</td>
                  <td className="px-4 py-2.5">{formatSui(launchFeeMist(id!))} SUI</td>
                  <td className="px-4 py-2.5">{formatSui(requiredBalanceMist(id!))} SUI</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Every fee is the 1 SUI OurBlast fee plus the launchpad's own on-chain charge (Suipump 2
          SUI, POPULAR and RIPT 1 SUI, Perpsplexity 5 SUI), so the bot never pays it for you.
          Leveraged launches also seed the pool with 1 {PERPSPLEXITY_CURVE_QUOTE_SYMBOL}. First
          buys on Suipump, POPULAR and RIPT are paid in SUI from your wallet on top of this. The
          same fee applies whether you launch from the terminal or from X. If your balance is
          short, the launch stops before anything is created and you get a top-up message. If a
          launch fails after the fee was taken — for example a chain error — the fee is sent back
          to your wallet automatically, so a retry never charges you twice.
        </p>
      </Block>

      <Block id="trade" kicker="Trading" title="Buying, selling and sending">
        <Cmd>buy 10 SUI of 0xTOKEN_ADDRESS</Cmd>
        <Cmd>sell 50% of $MYCOIN</Cmd>
        <Cmd>buy and burn 1 SUI of 0xTOKEN_ADDRESS</Cmd>
        <Cmd>{`send 5 SUI to @friendhandle`}</Cmd>
        <Cmd>send 2 SUI to name.sui</Cmd>
        <Cmd>send 2 SUI to 0xADDRESS</Cmd>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">Best price routing.</strong> Coins still on a
            bonding curve (Suipump, Blast.fun) are bought on the curve. Everything else races
            Aftermath and Cetus for the best route, with Bluefin as backup.
          </li>
          <li>
            <strong className="text-foreground">5% safety limit.</strong> Each trade is test-run
            first. If the price moves more than 5% before it fills, it stops and nothing is spent.
          </li>
          <li>
            <strong className="text-foreground">0.25% router fee.</strong> Trades routed through
            Aftermath carry a 0.25% fee that goes to the OurBlast community treasury.
          </li>
          <li>
            <strong className="text-foreground">Checked before sending.</strong> SuiNS names and X
            handles are looked up first, so a typo never costs you gas. If a piece is missing (an
            amount, a destination) the bot replies with exactly what to add.
          </li>
        </ul>
      </Block>

      <Block id="escrow" kicker="OTC" title="OTC escrow — trade safely with anyone">
        <p>
          Swap coins with another X user without trusting them first. The bot holds both sides in a
          one-time escrow wallet and only releases them once both have arrived.
        </p>
        <Cmd>@Ourblastbot escrow with @friend 10 SUI for 50000 $BLAST</Cmd>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>The bot replies with a deal number (#N) and a fresh escrow wallet address for this deal only.</li>
          <li>You send your side (10 SUI); your friend sends theirs (50,000 $BLAST) to that address.</li>
          <li>
            As soon as both deposits land, it settles automatically: each side goes to the other
            person's OurBank wallet, and the bot replies with the transaction link.
          </li>
        </ol>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong className="text-foreground">Fee:</strong> 0.5% of each side, sent to the OurBlast treasury.</li>
          <li><strong className="text-foreground">24h timeout:</strong> if both sides aren't funded within 24 hours, every deposit is refunded.</li>
          <li>
            <strong className="text-foreground">Cancel anytime before settling:</strong> either party posts{" "}
            <em>@Ourblastbot cancel escrow #N</em> and deposits go back to each OurBank wallet.
          </li>
          <li><strong className="text-foreground">Overpaid?</strong> Anything above the agreed amount is returned to the sender's OurBank wallet.</li>
          <li><strong className="text-foreground">Coins only:</strong> SUI, USDC, $BLAST or any token by its full coin type (0x…::coin::COIN). NFTs aren't supported yet.</li>
          <li><strong className="text-foreground">No gas needed:</strong> the bot pays network fees for settlement and refunds.</li>
        </ul>
      </Block>

      <Block id="crosschain" kicker="Any chain" title="Buy from another chain — one shot">
        <p>
          Hold ETH, SOL or USDC somewhere else? Open <em>Buy with ETH / SOL</em> on the home page.
          You sign once in your own wallet (MetaMask, Phantom…) and end up holding $BLAST in OurBank.
        </p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Sign in with X or with <em>MetaMask / Rabby</em> (one free signature), then tap <em>Get my address + auto-swap</em> to get your OurBank address.</li>
          <li>Pick your chain and coin in the swap, paste that address as the Sui destination, and confirm.</li>
          <li>When the SUI lands, OurBank swaps it into $BLAST automatically and shows the transaction link.</li>
        </ol>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong className="text-foreground">Pay from:</strong> Solana, Ethereum, Base, Arbitrum, BNB Chain, Optimism, Polygon, Avalanche, HyperEVM and Monad (via Mayan).</li>
          <li><strong className="text-foreground">NEAR:</strong> swap NEAR to SUI on NEAR Intents, send it to your OurBank address — the auto-swap does the rest.</li>
          <li><strong className="text-foreground">Arc (USDC):</strong> bridge native USDC to your OurBank address with Circle CCTP (min 1 USDC); it is auto-swapped into $BLAST. Keep a little SUI for gas.</li>
          <li><strong className="text-foreground">Robinhood Chain:</strong> move ETH/USDC to Arbitrum or Base with Relay first, then use the swap.</li>
          <li><strong className="text-foreground">Rules:</strong> at least 0.1 SUI must arrive; 0.05 SUI stays for network fees; only newly arrived SUI is swapped, never what was already in your wallet.</li>
          <li><strong className="text-foreground">Window:</strong> each auto-swap waits 45 minutes for the deposit. If a swap fails, your SUI stays safe in OurBank.</li>
          <li><strong className="text-foreground">Fees:</strong> the bridge's own fee plus the usual 0.25% on Aftermath swaps. No custody — OURBLAST never holds funds on the other chain.</li>
        </ul>
      </Block>

      <Block id="evm-x" kicker="MetaMask / Rabby" title="Use @Ourblastbot from an EVM account">
        <p>
          Signed in with MetaMask or Rabby? Your OurBank wallet works on the site straight away. To
          also control it from X, link your X account once.
        </p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Open the Terminal and tap <em>Link X to use @Ourblastbot</em>, then approve on X.</li>
          <li>Your OurBank wallet — and everything in it — now answers to your X handle.</li>
          <li>Post commands like <em>@Ourblastbot show my wallet</em>, <em>@Ourblastbot buy 5 SUI of $BLAST</em> or <em>@Ourblastbot send 100 $BLAST to @friend</em>.</li>
        </ol>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong className="text-foreground">Same wallet everywhere:</strong> the address doesn't change, so bridged funds and earlier buys stay put.</li>
          <li><strong className="text-foreground">Already used the bot on X?</strong> If your X handle already has its own OurBank wallet, we keep both untouched and the bot uses the X one — funds are never merged automatically.</li>
        </ul>
      </Block>


      <Block id="claim" kicker="Earnings" title="Creator fees — the full rules">
        <p>
          Coins you launch earn you trading fees: the launchpad pays a creator fee on every trade,
          and OURBLAST's share of that fee is split in fixed parts the moment fees are collected.
          The split is the same on every launchpad and cannot be changed per coin.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-left font-body text-sm">
            <thead className="bg-secondary/40 text-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Recipient</th>
                <th className="px-4 py-2.5 font-semibold">Share</th>
                <th className="px-4 py-2.5 font-semibold">What it is for</th>
              </tr>
            </thead>
            <tbody>
              {CREATOR_FEE_ROUTES.map((route) => (
                <tr key={route.label} className="border-t border-border">
                  <td className="px-4 py-2.5 text-foreground">{route.label}</td>
                  <td className="px-4 py-2.5">{Math.round(route.share * 100)}%</td>
                  <td className="px-4 py-2.5">
                    {route.address ? "Ops, development or community treasury" : "Yours — " + LAUNCHER_SHARE_USES}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="pt-2 font-body text-sm font-bold text-foreground">
          How to check and claim
        </h3>
        <Cmd>check fees on $MYCOIN</Cmd>
        <Cmd>claim my fees on $MYCOIN</Cmd>
        <p>
          These work in the terminal and as an X reply — on X, write it as{" "}
          <em>{BOT_HANDLE} check fees on $MYCOIN</em> or{" "}
          <em>{BOT_HANDLE} claim my fees on $MYCOIN</em>. Claiming triggers the on-chain payout
          straight from the launchpad; it is not a transfer the bot holds.
        </p>

        <h3 className="pt-2 font-body text-sm font-bold text-foreground">The claim rules</h3>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">Locked at launch.</strong> The fee recipients are
            written into the coin when it is created and cannot be changed, redirected or stolen
            afterwards — a claim always pays the recipients fixed at launch, no matter what the
            claim message says.
          </li>
          <li>
            <strong className="text-foreground">Who can claim.</strong> Only the X account that
            launched the token, or the account the fees were designated to, can trigger the claim
            from X. The bot matches the handle of the poster — a claim from another account is
            refused.
          </li>
          <li>
            <strong className="text-foreground">Redirect requests change nothing.</strong> Saying
            "claim my fees and send them to @someone" releases the fees, but they still pay the
            recipients locked in at launch — never a new address from the message.
          </li>
          <li>
            <strong className="text-foreground">Route them to someone else instead.</strong> If you
            want a different wallet to receive your launcher share, set that <em>before</em> you launch: in the
            terminal, open the fee routing card (or type <em>fee routing</em>) and choose your own
            wallet, another Sui wallet, or an X handle. An X handle gets an OURBLAST claim link the
            designated account can use to collect the fees.
          </li>
          <li>
            <strong className="text-foreground">Once claimed, it stands.</strong> After the
            designated wallet claims, the destination is remembered and future launches pay it
            straight on chain.
          </li>
          <li>
            <strong className="text-foreground">No linked wallet? Your share is safe.</strong> If
            your X account has no linked Sui wallet, your 80% goes to your OurBank wallet. If you
            have neither, it is held in trust in the bot wallet until you claim or link one.
          </li>
          <li>
            <strong className="text-foreground">Perpsplexity fees.</strong> Leveraged coins pay
            creator fees in USDC. Check and claim them from X or the terminal like any other coin;
            the USDC is split 80/10/10 automatically.
          </li>
        </ul>
        <p>
          <Link to="/creator-fees" className="text-primary underline">
            See the creator fees page
          </Link>{" "}
          for live balances and the fee routing setup.
        </p>
      </Block>

      <Block id="pads" kicker="Platforms" title="Launchpads">
        <div className="grid gap-3 sm:grid-cols-2">
          {pads.map((pad) => (
            <div key={pad.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xl">{pad.label}</h3>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 font-body text-[0.65rem] font-bold tracking-wide text-primary uppercase">
                  Live
                </span>
              </div>
              <p className="mt-2 font-body text-sm text-muted-foreground">
                Pairs against {pad.pairTokens.join(", ")}.{" "}
                {pad.supportsCustomPair ? "You can choose the pairing token." : "Paired in SUI."}
              </p>
              <a
                href={pad.site}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block font-body text-xs font-semibold text-primary"
              >
                {pad.site.replace("https://", "")} →
              </a>
            </div>
          ))}
        </div>
        {soon.length ? (
          <p>Not yet available: {soon.map((pad) => pad.label).join(", ")}.</p>
        ) : null}
      </Block>

      <Block id="matrix" kicker="Compare" title="Launchpad feature & fee matrix">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] border-collapse text-left font-body text-sm">
            <thead className="bg-secondary/40 text-foreground">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Feature</th>
                {["Suipump", "POPULAR", "RIPT (paused)", "Perpsplexity", "Maelstrom"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Type", "Bonding curve", "Bonding curve → Cetus at 5,000 SUI", "Bluefin pool, locked LP", "Leveraged composite", "Cetus CLMM, locked LP"],
                  ["Pair", "SUI", "SUI", "SUI", "USDC", "SUI / USDC / BLAST / DEEP / WAL"],
                  ["Dev buy", "SUI", "SUI", "SUI", "USDC", "—"],
                  ["Anti-sniper first buy", "Same block", "Same block", "Same block", "Same block", "—"],
                  ["Creator fee split", "80/10/10", "80/10/10", "100% launcher", "80/10/10 (USDC)", "80/10/10"],
                  ["Pad on-chain fee", "2 SUI", "1 SUI", "1 SUI", "5 SUI", "0 SUI"],
                  ["OurBlast fee", "1 SUI", "1 SUI", "1 SUI", "1 SUI", "1 SUI"],
                  ...[["Total launch fee", "suipump"], ["Balance needed", "suipump"]].map(([label]) => [
                    label,
                    ...["suipump", "popular", "ript", "perpsplexity", "maelstrom"].map((id) =>
                      `${formatSui(label === "Total launch fee" ? launchFeeMist(id) : requiredBalanceMist(id))} SUI${label === "Balance needed" && id !== "maelstrom" ? " + dev buy" : ""}`,
                    ),
                  ]),
                  ["Failed launch", "Full refund", "Full refund", "Full refund", "Full refund", "Full refund"],
                  ["Launch from", "X + terminal", "X + terminal", "X + terminal", "X + terminal", "X + terminal"],
                  ["Claim fees via", "X / terminal / page", "X / terminal / page", "On-chain to launcher", "X / terminal", "X / terminal / page"],
                ] as string[][]
              ).map(([label, ...cells]) => (
                <tr key={label} className="border-t border-border">
                  <td className="px-3 py-2.5 font-semibold text-foreground">{label}</td>
                  {cells.map((c, i) => (
                    <td key={i} className="px-3 py-2.5">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Blast.fun follows the Maelstrom fee row. Fees and splits above apply to new launches.</p>
      </Block>

      <Block id="markets" kicker="Leveraged" title={`Markets you can pair with (${PERPSPLEXITY_MARKETS.length})`}>
        <p>Use any of these names as the market in a leveraged launch:</p>
        <div className="flex flex-wrap gap-1.5">
          {PERPSPLEXITY_MARKETS.map((market) => (
            <span
              key={market.symbol}
              className="rounded-md border border-border bg-secondary/30 px-2 py-1 font-mono text-xs text-foreground"
            >
              {market.label}
            </span>
          ))}
        </div>
        <p>
          New markets are added as they open. If a name is not on this list the bot will tell you
          and the launch is not created.
        </p>
      </Block>

      <Block id="blast" kicker="Community" title="$BLAST, arcade and city">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">$BLAST</strong> — 1,000,000,000 fixed supply, burned
            liquidity, no buy or sell tax, no dev wallet.
          </li>
          <li>
            <Link to="/arcade" className="text-primary underline">
              Arcade
            </Link>{" "}
            — play for BLAST POINTS, daily challenges and leaderboard ranks.
          </li>
          <li>
            <Link to="/build" className="text-primary underline">
              Builder City
            </Link>{" "}
            — claim and build your block on Blast Island.
          </li>
          <li>
            <Link to="/launches" className="text-primary underline">
              Launches
            </Link>{" "}
            — every coin the bot has deployed, with live links.
          </li>
          <li>
            <strong className="text-foreground">Open MCP endpoint</strong> — AI agents such as
            Claude or Cursor can inspect launches, builders and pad metrics through the public,
            read-only endpoint at ourblast.xyz/mcp. No wallets, keys or private data are exposed.
          </li>
          <li>
            <Link to="/how-to-play" className="text-primary underline">
              How to play
            </Link>{" "}
            — the five-step beginner guide to points and ranks.
          </li>
        </ul>
      </Block>

      <Block id="faq" kicker="Questions" title="FAQ">
        <div className="space-y-4">
          {[
            {
              q: "The bot did not reply to my post. Why?",
              a: `It only sees posts that tag ${BOT_HANDLE} directly. Quoting or mentioning the name in text is not enough. Thank-yous and shoutouts get a friendly reply, not a launch — a coin is only created when the post clearly asks for one.`,
            },
            {
              q: "Can I change my coin's picture after launch?",
              a: "No. The icon is written permanently when the coin is created, so attach the right image to the post before you send it.",
            },
            {
              q: "Who pays for my first buy?",
              a: "You do, from your own OurBank wallet, and the tokens or position go to that same wallet. The bot never buys your coin for you.",
            },
            {
              q: "What happens if a launch fails?",
              a: "Nothing is announced. Any money moved for your first buy is returned to your wallet, and the launch fee is refunded automatically — a retry never charges twice.",
            },
            {
              q: "Can fees be paid to a different wallet later?",
              a: "No. The fee recipient is fixed inside the coin at launch and cannot be changed.",
            },
          ].map((item) => (
            <div key={item.q} className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-body text-sm font-bold text-foreground">{item.q}</h3>
              <p className="mt-1.5 font-body text-sm text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </Block>

      <section className="panel px-5 py-8 text-center sm:px-9">
        <h2 className="font-display text-3xl uppercase">Ready to try it?</h2>
        <p className="mx-auto mt-2 max-w-md font-body text-sm text-muted-foreground">
          Open the terminal and type a command, or tag {BOT_HANDLE} on X.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            to="/"
            className="rounded-full bg-primary px-5 py-2.5 font-body text-sm font-bold text-primary-foreground"
          >
            Open the terminal
          </Link>
          <a
            href="https://x.com/Ourblastbot"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border-2 border-border px-5 py-2.5 font-body text-sm font-bold text-foreground"
          >
            {BOT_HANDLE} on X
          </a>
        </div>
      </section>
    </div>
  );
}
