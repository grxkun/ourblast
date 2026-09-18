import { createFileRoute, Link } from "@tanstack/react-router";

import { SectionTitle } from "@/components/blast/AppShell";

const LAST_UPDATED = "18 September 2026";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — OURBLAST" },
      {
        name: "description",
        content:
          "The terms for using OURBLAST: the community arcade, Blast Build cities, chat, the launch terminal and the @ourblastbot launch caller on Sui.",
      },
      { property: "og:title", content: "Terms of Service — OURBLAST" },
      {
        property: "og:description",
        content: "Plain-language terms for the OURBLAST community arcade, builder cities and launch terminal on Sui.",
      },
    ],
  }),
  component: TermsPage,
});

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t-2 border-border pt-6">
      <h2 className="font-display text-2xl leading-none">{title}</h2>
      <div className="mt-3 space-y-3 font-body text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <SectionTitle kicker="Legal" title="Terms of Service" />
      <p className="font-body text-sm text-muted-foreground">
        Last updated {LAST_UPDATED}. These terms are published by the OURBLAST community, the operator of ourblast.xyz
        and the @ourblastbot account on X. By using the site you agree to them.
      </p>

      <div className="mt-8 space-y-8">
        <Clause title="1. What OURBLAST is">
          <p>
            OURBLAST is a community project built around $BLAST, a meme coin on Sui. It includes an arcade, community
            chat, meme battles, Blast Build builder cities and a conversational launch terminal. It is entertainment, not
            a financial product, an exchange, a broker, or a custodian.
          </p>
          <p>
            $BLAST has no intrinsic value and no expectation of financial return. Nothing on this site is financial,
            investment, tax or legal advice. Do your own research.
          </p>
        </Clause>

        <Clause title="2. Your wallet stays yours">
          <p>
            You connect your own Sui wallet and sign every transaction yourself. We never ask for, receive or store seed
            phrases or private keys, and we never sign on your behalf. Anyone asking you for a seed phrase in our name is
            scamming you.
          </p>
          <p>
            You are responsible for keeping your wallet and its recovery details safe. Transactions on Sui are final and
            cannot be reversed by us.
          </p>
        </Clause>

        <Clause title="3. Paid arcade runs and rewards">
          <p>
            A paid arcade run costs 1 SUI. The fee is split between the community prize pool, the project treasury and
            the founder address, as published on the site. Paying for a run buys you one attempt at the game — it is not
            an investment and does not entitle you to any return.
          </p>
          <p>
            Rewards and payouts are discretionary, may change at any time, and can be withheld where we believe a score
            was obtained by cheating, automation, or exploiting a bug. Free practice and tutorial modes cost nothing and
            award nothing.
          </p>
        </Clause>

        <Clause title="4. The launch terminal and @ourblastbot">
          <p>
            The terminal and the @ourblastbot launch caller prepare a token launch configuration from your instructions.
            They are drafts: no token is created and no funds move until you sign a transaction with your own wallet on
            the launch platform. We never claim a launch happened before it is confirmed on-chain.
          </p>
          <p>
            Launch platforms (such as SuiPump or Maelstrom) are independent third parties. Their fees, bonding curves and
            rules are theirs, not ours, and we are not responsible for what happens on them.
          </p>
          <p>
            Access to the terminal may be limited to a tester list while features are being wired up. Do not use it to
            impersonate people or projects, or to launch tokens that infringe someone else's rights.
          </p>
        </Clause>

        <Clause title="5. Community rules">
          <p>
            Keep it fun. No spam or flooding, no harassment or hate, no threats, no sexual content involving minors, no
            illegal content, no scam links, no impersonation of other members or projects, and no automated abuse of the
            games, chat or bot.
          </p>
          <p>
            We can hide or delete content, mute accounts, ban wallets and remove scores or rewards when these rules are
            broken, without notice. Content you post publicly (chat messages, memes, nicknames, builder cities) can be
            shown to other users and moderated.
          </p>
        </Clause>

        <Clause title="6. Third-party accounts">
          <p>
            Connecting GitHub or X is optional and lets you unlock builder features or call the bot. Those services have
            their own terms, and we only read the public profile and activity data needed for the feature you asked for.
            You can stop using them at any time.
          </p>
        </Clause>

        <Clause title="7. Availability and liability">
          <p>
            The site is provided "as is" and "as available". Features can change, break or disappear, and the network can
            be congested or unavailable. To the maximum extent permitted by law, the OURBLAST community and its
            contributors are not liable for lost tokens, failed or front-run transactions, missed rewards, downtime, or
            any indirect or consequential loss arising from your use of the site.
          </p>
        </Clause>

        <Clause title="8. Changes and contact">
          <p>
            We may update these terms. The date at the top always shows the current version, and continuing to use the
            site after a change means you accept it.
          </p>
          <p>
            Questions about these terms, or a moderation decision you want reviewed? Reach us in the OURBLAST Telegram
            group linked in the site footer, or message @ourblastbot on X.
          </p>
        </Clause>
      </div>

      <p className="mt-10 font-body text-sm">
        See also our{" "}
        <Link to="/privacy" className="font-bold text-primary underline">
          Privacy Policy
        </Link>
        .
      </p>
    </article>
  );
}
