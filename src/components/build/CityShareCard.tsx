import { Download, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type CityShareCardProps = {
  username: string;
  cityLevel: number;
  builderPower: number;
  projects: number;
  commits: number;
  packages: number;
  compact?: boolean;
};

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char);
}

export function CityShareCard({ username, cityLevel, builderPower, projects, commits, packages, compact = false }: CityShareCardProps) {
  const cleanUsername = username.replace(/^@/, "");
  const url = `https://ourblast.xyz/builder/${encodeURIComponent(cleanUsername)}`;
  const text = `@${cleanUsername}'s Sui Builder City · Level ${cityLevel} · ${projects} verified Sui projects · Builder Power ${builderPower.toLocaleString()}`;

  const share = async () => {
    if (navigator.share) await navigator.share({ title: `@${cleanUsername}'s Sui Builder City`, text, url });
    else { await navigator.clipboard.writeText(url); toast.success("City link copied"); }
  };
  const copy = async () => { await navigator.clipboard.writeText(url); toast.success("City link copied"); };
  const download = () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f5edd8"/><path d="M0 90H1200M0 540H1200" stroke="#171410" stroke-width="4"/><text x="72" y="74" font-family="monospace" font-size="22" font-weight="700" fill="#e3262e">OURBLAST / SUI BUILDER CITY</text><text x="72" y="190" font-family="Impact,Arial Black,sans-serif" font-size="84" fill="#171410">@${escapeXml(cleanUsername)}</text><text x="72" y="268" font-family="monospace" font-size="28" fill="#e3262e">CITY LEVEL ${cityLevel}</text><g font-family="monospace" fill="#171410"><text x="72" y="380" font-size="25">BUILDER POWER</text><text x="72" y="438" font-size="54" font-weight="700">${builderPower.toLocaleString()}</text><text x="465" y="380" font-size="25">SUI PROJECTS</text><text x="465" y="438" font-size="54" font-weight="700">${projects}</text><text x="755" y="380" font-size="25">COMMITS</text><text x="755" y="438" font-size="54" font-weight="700">${commits.toLocaleString()}</text><text x="1010" y="380" font-size="25">PACKAGES</text><text x="1010" y="438" font-size="54" font-weight="700">${packages}</text><text x="72" y="590" font-size="24">ourblast.xyz/builder/${escapeXml(cleanUsername)}</text></g></svg>`;
    const href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      URL.revokeObjectURL(href);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a"); anchor.href = pngUrl; anchor.download = `${cleanUsername}-sui-city.png`; anchor.click(); URL.revokeObjectURL(pngUrl);
      }, "image/png");
    };
    image.src = href;
  };

  if (compact) return <div className="flex flex-wrap gap-2"><Button onClick={() => void share()} className="rounded-sm bg-build-cyan text-build-bg"><Share2/>Share city</Button><Button onClick={() => void download()} variant="outline" className="rounded-sm border-build-line bg-transparent text-build-text"><Download/>Social card</Button></div>;
  return <section className="border-2 border-build-line bg-build-panel p-5 sm:p-7" aria-labelledby="share-city-title">
    <p className="font-mono text-xs font-bold text-build-cyan">CITY TRANSMISSION</p><h2 id="share-city-title" className="mt-2 font-build text-4xl normal-case">Share your city</h2>
    <div className="mt-5 border border-build-line bg-build-bg p-5"><p className="font-build text-3xl normal-case">@{cleanUsername}</p><p className="mt-2 font-mono text-xs text-build-muted">LEVEL {cityLevel} · {projects} SUI PROJECTS · {packages} PACKAGES</p></div>
    <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => void share()} className="rounded-sm bg-build-cyan text-build-bg"><Share2/>Share</Button><Button onClick={() => void copy()} variant="outline" className="rounded-sm border-build-line bg-transparent text-build-text"><Link2/>Copy link</Button><Button onClick={download} variant="outline" className="rounded-sm border-build-line bg-transparent text-build-text"><Download/>Download card</Button></div>
  </section>;
}