import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Building2, MapPin, Waves } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type AtlasBuilder = {
  id: string;
  username: string;
  avatarUrl?: string | null;
  cityLevel: number;
  tier: string;
  value: number;
  verifiedProjects: number;
};

export function BuilderAtlas({ builders }: { builders: AtlasBuilder[] }) {
  const visibleBuilders = builders.slice(0, 24);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = visibleBuilders.find((builder) => builder.id === selectedId) ?? visibleBuilders[0];

  return <div className="builder-atlas mt-6 border-2 border-build-line bg-build-panel">
    <div className="builder-atlas-map" aria-label="Blast Island developer cities">
      <div className="builder-atlas-ocean" aria-hidden="true"><Waves /></div>
      <div className="builder-atlas-island" aria-hidden="true">
        <div className="builder-atlas-lagoon"><span/><span/></div>
        <div className="builder-atlas-road builder-atlas-road-x"/>
        <div className="builder-atlas-road builder-atlas-road-y"/>
      </div>
      <div className="builder-atlas-heading">
        <span className="build-status-dot"/>
        <span>BLAST ISLAND · {visibleBuilders.length} DEVELOPER CITIES</span>
      </div>
      {visibleBuilders.map((builder, index) => {
        const isSelected = builder.id === selected?.id;
        return <Button
          key={builder.id}
          type="button"
          variant="outline"
          size="icon"
          aria-label={`View @${builder.username}'s city`}
          aria-pressed={isSelected}
          onClick={() => setSelectedId(builder.id)}
          className={`builder-atlas-marker atlas-marker-${index} ${isSelected ? "is-selected" : ""}`}
        >
          <Building2 />
          <span className="builder-atlas-marker-label">@{builder.username}</span>
        </Button>;
      })}
      {!visibleBuilders.length ? <div className="builder-atlas-empty"><MapPin/><strong>THE FIRST CITY DOT IS OPEN.</strong></div> : null}
    </div>

    {selected ? <aside className="builder-atlas-detail" aria-live="polite">
      <div className="flex min-w-0 items-center gap-3">
        {selected.avatarUrl ? <img src={selected.avatarUrl} alt="" className="size-11 border border-build-line object-cover"/> : <span className="grid size-11 place-items-center border border-build-line bg-build-panel-2"><Building2 className="size-5 text-build-cyan"/></span>}
        <div className="min-w-0">
          <p className="font-mono text-[0.58rem] font-bold text-build-cyan">SELECTED DEVELOPER CITY</p>
          <h3 className="truncate font-build text-3xl normal-case">@{selected.username}</h3>
        </div>
      </div>
      <dl className="builder-atlas-stats">
        <div><dt>City</dt><dd>L{selected.cityLevel}</dd></div>
        <div><dt>Tier</dt><dd>{selected.tier.replaceAll("-", " ")}</dd></div>
        <div><dt>Projects</dt><dd>{selected.verifiedProjects}</dd></div>
        <div><dt>Rank value</dt><dd>{selected.value.toLocaleString()}</dd></div>
      </dl>
      <Button asChild className="w-full rounded-sm bg-build-cyan text-build-bg hover:bg-build-cyan/85 sm:w-auto">
        <Link to="/builder/$username" params={{ username: selected.username }}>Open @{selected.username}'s city <ArrowUpRight/></Link>
      </Button>
    </aside> : null}
  </div>;
}