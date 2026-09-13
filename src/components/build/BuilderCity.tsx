import { Building2, RotateCcw } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import type { BuildingType } from "@/lib/blast-build.config";
import { BUILDING_LABELS } from "@/lib/blast-build.config";
import { Button } from "@/components/ui/button";
import type { CityBuilding } from "./builder-city.types";

const BuilderCity3D = lazy(() => import("./BuilderCity3D"));

const demo: CityBuilding[] = [
  { id: "demo-1", building_type: "move", building_level: 12, district_key: "move", position_x: 0, position_y: 0, builder_repositories: { name: "sui-move-core", sui_relevance: 96, description: "Move package" } },
  { id: "demo-2", building_type: "defi", building_level: 9, district_key: "defi", position_x: 1, position_y: 0, builder_repositories: { name: "liquid-station", sui_relevance: 91, description: "Sui DeFi protocol" } },
  { id: "demo-3", building_type: "gaming", building_level: 7, district_key: "gaming", position_x: 2, position_y: 0, builder_repositories: { name: "sui-quest", sui_relevance: 84, description: "Onchain game" } },
  { id: "demo-4", building_type: "tooling", building_level: 6, district_key: "tooling", position_x: 3, position_y: 0, builder_repositories: { name: "move-kit", sui_relevance: 79, description: "Developer tools" } },
];

export function BuilderCity({ buildings = [], username = "builder", level = 1, interactive = true, profileHref }: {
  buildings?: CityBuilding[];
  username?: string;
  level?: number;
  interactive?: boolean;
  profileHref?: string;
}) {
  const list = buildings.length ? buildings : demo;
  const [selected, setSelected] = useState<CityBuilding | null>(null);
  const [mounted, setMounted] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    setWebgl(Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")));
    setMounted(true);
  }, []);

  return (
    <div className="build-city" aria-label={`${username}'s Sui Builder City`}>
      <div className="city-3d-toolbar">
        <span><span className="build-status-dot" /> LIVE CITY · {list.length} BUILDINGS</span>
        <Button type="button" variant="outline" size="icon" onClick={() => setResetKey((key) => key + 1)} aria-label="Reset city view" title="Reset city view"><RotateCcw /></Button>
      </div>
      <div className="city-3d-stage">
        {mounted && webgl ? (
          <Suspense fallback={<CityLoading />}>
            <BuilderCity3D
              buildings={list}
              username={username}
              level={level}
              interactive={interactive}
              {...(selected?.id ? { selectedId: selected.id } : {})}
              profileEnabled={Boolean(profileHref)}
              onSelect={setSelected}
              onOpenProfile={() => { setSelected(null); if (profileHref) window.location.assign(profileHref); }}
              resetKey={resetKey}
            />
          </Suspense>
        ) : <CityLoading unavailable={mounted && !webgl} />}
      </div>
      <div className="city-3d-help" aria-hidden="true">DRAG TO ORBIT · SCROLL TO ZOOM · SELECT A BUILDING</div>
      <div className="sr-only" aria-label="City buildings">
        {list.slice(0, 10).map((building) => {
          const type = building.building_type in BUILDING_LABELS ? building.building_type as BuildingType : "dapp";
          return <button key={building.id} type="button" disabled={!interactive} onClick={() => setSelected(building)}>{building.builder_repositories?.name ?? BUILDING_LABELS[type]}, developer level {building.building_level}</button>;
        })}
      </div>
      {selected ? (
        <div className="city-3d-detail">
          <Button type="button" variant="ghost" size="icon" aria-label="Close building details" onClick={() => setSelected(null)} className="absolute right-2 top-2">×</Button>
          <p className="text-[0.65rem] font-bold tracking-[0.16em] text-build-cyan uppercase">{BUILDING_LABELS[(selected.building_type in BUILDING_LABELS ? selected.building_type : "dapp") as BuildingType]}</p>
          <h3 className="mt-1 font-build text-lg normal-case">{selected.builder_repositories?.name}</h3>
          <div className="mt-3 flex gap-5 font-mono text-xs text-build-muted">
            <span>DEVELOPER LEVEL <b className="text-build-text">{selected.building_level}</b></span>
            <span>SUI <b className="text-build-text">{selected.builder_repositories?.sui_relevance ?? 0}</b></span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CityLoading({ unavailable = false }: { unavailable?: boolean }) {
  return <div className="city-3d-loading"><Building2 /><strong>{unavailable ? "3D view unavailable" : "Building your city…"}</strong><span>{unavailable ? "Your project list remains available below." : "Loading the landscape"}</span></div>;
}
