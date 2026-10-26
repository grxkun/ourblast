// SPDX-License-Identifier: BUSL-1.1
import { createFileRoute } from "@tanstack/react-router";

import { useBlast } from "@/components/blast/session";
import { NftPanel } from "@/components/terminal/NftPanel";
import { SocialSignIn } from "@/components/terminal/SocialSignIn";

export const Route = createFileRoute("/assets")({
  head: () => ({
    meta: [
      { title: "Assets — Your Sui NFTs | OURBLAST" },
      { name: "description", content: "See and send the NFTs in your OurBank Sui wallet, including kiosk-held collectibles." },
      { property: "og:title", content: "OURBLAST Assets — Sui NFTs" },
      { property: "og:description", content: "Your OurBank NFTs in one place, with reviewed sends." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssetsPage,
});

function AssetsPage() {
  const { userId } = useBlast();
  return (
    <div className="space-y-4">
      <div>
        <p className="font-body text-xs font-bold uppercase text-primary">OurBank wallet</p>
        <h1 className="mt-1 font-display text-4xl sm:text-5xl">Assets</h1>
        <p className="mt-2 text-sm text-muted-foreground">NFTs in your main OurBank Sui wallet, including kiosk-locked items. Sends always show a review first.</p>
      </div>
      {userId ? <NftPanel userId={userId} /> : <SocialSignIn />}
    </div>
  );
}
