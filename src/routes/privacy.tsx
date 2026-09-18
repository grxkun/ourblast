import { createFileRoute, Link } from "@tanstack/react-router";

import { SectionTitle } from "@/components/blast/AppShell";

const LAST_UPDATED = "18 September 2026";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — OURBLAST" },
      {
        name: "description",
        content:
          "What OURBLAST stores about you: wallet address, nickname, game results, chat messages, terminal history, connected GitHub and X details — and how to have it removed.",
      },
      { property: "og:title", content: "Privacy Policy — OURBLAST" },
      {
        property: "og:description",
        content: "What OURBLAST stores, why we store it, who else can see it, and how to ask for deletion.",
      },
    ],
  }),
  component: PrivacyPage,
});

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t-2 border-border pt-6">
      <h2 className="font-display text-2xl leading-none">{title}</h2>
      <div className="mt-3 space-y-3 font-body text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <SectionTitle kicker="Legal" title="Privacy Policy" />
      <p className="font-body text-sm text-muted-foreground">
        Last updated {LAST_UPDATED}. This policy is published by the OURBLAST community, the operator of ourblast.xyz and
        the @ourblastbot account on X. We keep the amount of data we hold as small as the features allow.
      </p>

      <div className="mt-8 space-y-8">
        <Clause title="1. What we store">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Your account:</strong> the Sui wallet address you connect with, your
              nickname and avatar seed, your points, streak and login days.
            </li>
            <li>
              <strong className="text-foreground">Game activity:</strong> scores, runs, combos, durations and the payment
              digest of each paid run.
            </li>
            <li>
              <strong className="text-foreground">Community content:</strong> chat messages, reactions, memes you submit
              and their review status.
            </li>
            <li>
              <strong className="text-foreground">Launch terminal:</strong> the commands you type, the parsed action and
              the reply you were shown. Signed-out visitors keep this only in their own browser.
            </li>
            <li>
              <strong className="text-foreground">Blast Build:</strong> your connected GitHub username, avatar, public
              profile text and public repository activity, plus the city, districts, buildings and badges derived from it.
            </li>
            <li>
              <strong className="text-foreground">X launch calls:</strong> when you mention @ourblastbot, we store the
              tweet id, your X username, the text of the tweet and the reply we drafted or posted.
            </li>
            <li>
              <strong className="text-foreground">Moderation records:</strong> actions taken by moderators, so decisions
              can be reviewed.
            </li>
          </ul>
          <p>
            We do not ask for your name, address, date of birth or payment card details, and we never hold seed phrases
            or private keys.
          </p>
        </Clause>

        <Clause title="2. Why we store it">
          <p>
            To run the things you asked for: leaderboards and prize payouts, the chat and meme battles, your builder city
            and rankings, terminal history you can re-run, and answering launch calls on X. Aggregate counts also help us
            see whether a feature works at all.
          </p>
        </Clause>

        <Clause title="3. What is public">
          <p>
            Leaderboards, builder cities, public builder profiles, meme battles and chat show your nickname, avatar and
            wallet address to other visitors. Your wallet address and every transaction you sign are already public and
            permanent on the Sui blockchain — that is how the network works, and neither we nor anyone else can delete
            them.
          </p>
          <p>You can keep your builder profile private in Blast Build if you don't want it listed.</p>
        </Clause>

        <Clause title="4. Who else sees it">
          <p>
            Our hosting and database provider stores the data on our behalf. GitHub and X receive requests when you
            connect those accounts or the bot replies to a tweet, under their own privacy policies. Price and blockchain
            data providers see only anonymous lookups.
          </p>
          <p>
            We do not sell your data, we do not run advertising trackers, and we do not share it with anyone else unless
            we are legally required to.
          </p>
        </Clause>

        <Clause title="5. How long we keep it">
          <p>
            Account, score and city records stay while your account exists, because leaderboards and rankings depend on
            them. Chat messages, terminal history and launch-call records are kept for as long as they are useful for
            moderation and support, and are removed on request.
          </p>
        </Clause>

        <Clause title="6. Deleting your data">
          <p>
            Ask us in the OURBLAST Telegram group linked in the site footer, or message @ourblastbot on X, from the
            wallet or account concerned, and we will delete your profile, nickname, chat messages, memes and terminal
            history. On-chain transactions cannot be deleted. You can also disconnect GitHub or X at any time, which
            stops any further reading of those accounts.
          </p>
        </Clause>

        <Clause title="7. Children">
          <p>OURBLAST is not intended for anyone under 18, and we don't knowingly keep data about children.</p>
        </Clause>

        <Clause title="8. Changes">
          <p>
            If this policy changes, the date at the top changes with it. Material changes will be announced in the
            community channels.
          </p>
        </Clause>
      </div>

      <p className="mt-10 font-body text-sm">
        See also our{" "}
        <Link to="/terms" className="font-bold text-primary underline">
          Terms of Service
        </Link>
        .
      </p>
    </article>
  );
}
