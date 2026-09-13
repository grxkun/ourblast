import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

type AtlasBuilder = { id: string; username: string; cityLevel: number; tier: string; value: number; verifiedProjects: number };

export function BuilderAtlas({ builders }: { builders: AtlasBuilder[] }) {
  return <div className="build-blueprint relative mt-6 min-h-[30rem] overflow-hidden border-2 border-build-line bg-build-panel p-4 sm:p-7">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Public Sui Builder cities">
      {builders.slice(0, 24).map((builder, index) => <Link key={builder.id} to="/builder/$username" params={{ username: builder.username }} className={`group relative flex min-h-32 flex-col justify-between border border-build-line bg-build-bg p-3 transition-transform hover:-translate-y-1 hover:border-build-cyan ${index % 7 === 0 ? "sm:col-span-2 sm:row-span-2 sm:min-h-64" : ""}`}>
        <span className="font-mono text-[0.58rem] font-bold text-build-cyan">BLOCK_{String(index + 1).padStart(2, "0")}</span>
        <Building2 className={index % 7 === 0 ? "size-12 text-build-cyan" : "size-7 text-build-cyan"}/>
        <span><strong className="block truncate font-build text-xl normal-case">@{builder.username}</strong><small className="font-mono text-[0.58rem] uppercase text-build-muted">{builder.tier.replaceAll("-", " ")} · L{builder.cityLevel} · {builder.verifiedProjects} projects</small></span>
      </Link>)}
    </div>
  </div>;
}