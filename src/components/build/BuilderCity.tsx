import { Building2, Factory, Gamepad2, Landmark, Satellite, Wrench, Bot, Users, Image, WalletCards, Code2 } from "lucide-react";
import { useState } from "react";

import type { BuildingType } from "@/lib/blast-build.config";
import { BUILDING_LABELS } from "@/lib/blast-build.config";
import { cn } from "@/lib/utils";

type Building = {
  id: string;
  building_type: string;
  building_level: number;
  district_key: string;
  position_x: number;
  position_y: number;
  builder_repositories?: { name: string; sui_relevance: number; description: string | null } | null;
};

const icons: Record<BuildingType, typeof Building2> = {
  dapp: Building2, move: Factory, nft: Image, defi: Landmark, gaming: Gamepad2,
  infrastructure: Satellite, tooling: Wrench, automation: Bot, social: Users,
  meme: Code2, wallet: WalletCards,
};

const demo: Building[] = [
  { id: "demo-1", building_type: "move", building_level: 12, district_key: "move", position_x: 0, position_y: 0, builder_repositories: { name: "sui-move-core", sui_relevance: 96, description: "Move package" } },
  { id: "demo-2", building_type: "defi", building_level: 9, district_key: "defi", position_x: 1, position_y: 0, builder_repositories: { name: "liquid-station", sui_relevance: 91, description: "Sui DeFi protocol" } },
  { id: "demo-3", building_type: "gaming", building_level: 7, district_key: "gaming", position_x: 2, position_y: 0, builder_repositories: { name: "sui-quest", sui_relevance: 84, description: "Onchain game" } },
  { id: "demo-4", building_type: "tooling", building_level: 6, district_key: "tooling", position_x: 3, position_y: 0, builder_repositories: { name: "move-kit", sui_relevance: 79, description: "Developer tools" } },
];

export function BuilderCity({ buildings = [], username = "builder", level = 1, interactive = true }: {
  buildings?: Building[];
  username?: string;
  level?: number;
  interactive?: boolean;
}) {
  const list = buildings.length ? buildings : demo;
  const [selected, setSelected] = useState<Building | null>(null);
  return (
    <div className="build-city" aria-label={`${username}'s Sui Builder City`}>
      <div className="build-skyline" aria-hidden="true" />
      <div className="build-grid">
        <button type="button" className="build-hq" onClick={() => setSelected(null)} aria-label="Builder HQ">
          <span className="build-hq-mark">BB</span>
          <span><strong>BUILDER HQ</strong><small>@{username} · LVL {level}</small></span>
        </button>
        {list.slice(0, 10).map((building, index) => {
          const type = building.building_type in icons ? building.building_type as BuildingType : "dapp";
          const Icon = icons[type];
          const repo = building.builder_repositories;
          return (
            <button
              type="button"
              key={building.id}
              disabled={!interactive}
              onClick={() => setSelected(building)}
              className={cn("build-building", `build-building-${(index % 5) + 1}`, selected?.id === building.id && "is-selected")}
              aria-label={`${repo?.name ?? BUILDING_LABELS[type]}, level ${building.building_level}`}
            >
              <span className="build-roof"><Icon /></span>
              <span className="build-windows" aria-hidden="true"><i /><i /><i /><i /></span>
              <span className="build-label">{repo?.name ?? BUILDING_LABELS[type]}</span>
              <span className="build-level">L{building.building_level}</span>
            </button>
          );
        })}
      </div>
      <div className="build-road" aria-hidden="true"><span /><span /><span /><span /></div>
      {selected ? (
        <div className="absolute inset-x-4 bottom-4 z-20 border border-build-line bg-build-panel/95 p-4 shadow-xl backdrop-blur sm:left-auto sm:w-80">
          <button type="button" aria-label="Close building details" onClick={() => setSelected(null)} className="absolute right-3 top-2 text-build-muted">×</button>
          <p className="text-[0.65rem] font-bold tracking-[0.16em] text-build-cyan uppercase">{BUILDING_LABELS[(selected.building_type in BUILDING_LABELS ? selected.building_type : "dapp") as BuildingType]}</p>
          <h3 className="mt-1 font-build text-lg normal-case">{selected.builder_repositories?.name}</h3>
          <div className="mt-3 flex gap-5 font-mono text-xs text-build-muted">
            <span>LEVEL <b className="text-build-text">{selected.building_level}</b></span>
            <span>SUI <b className="text-build-text">{selected.builder_repositories?.sui_relevance ?? 0}</b></span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
