import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Building2, Github, Minus, Plus, Rotate3D, RotateCcw } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { IslandCameraCommand, IslandDeveloper } from "./builder-atlas.types";

const BuilderIsland3D = lazy(() => import("./BuilderIsland3D"));

export function BuilderAtlas({ builders }: { builders: IslandDeveloper[] }) {
  const visibleBuilders = builders.slice(0, 100);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [cameraCommand, setCameraCommand] = useState<IslandCameraCommand>();
  const selected = visibleBuilders[selectedIndex];
  const command = (next: Omit<IslandCameraCommand, "id">) => setCameraCommand({ ...next, id: Date.now() } as IslandCameraCommand);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    setWebgl(Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")));
    setMounted(true);
  }, []);

  const selectCity = (index: number) => { setSelectedIndex(index); command({ type: "focus", index }); };

  return <div className="mt-6 grid gap-5">
    <section className="builder-atlas-map border-2 border-build-line bg-build-panel" aria-label="3D Blast Island developer map">
      <div className="builder-atlas-heading"><span className="build-status-dot"/><span>BLAST ISLAND · {visibleBuilders.length} REAL SUI DEVELOPER CITIES</span></div>
      <div className="builder-atlas-controls" aria-label="Island camera controls">
        <Button type="button" variant="outline" size="icon" onClick={() => command({ type: "rotate", amount: -0.42 })} aria-label="Rotate island left"><Rotate3D className="-scale-x-100"/></Button>
        <Button type="button" variant="outline" size="icon" onClick={() => command({ type: "rotate", amount: 0.42 })} aria-label="Rotate island right"><Rotate3D/></Button>
        <Button type="button" variant="outline" size="icon" onClick={() => command({ type: "zoom", amount: -6 })} aria-label="Zoom into island"><Plus/></Button>
        <Button type="button" variant="outline" size="icon" onClick={() => command({ type: "zoom", amount: 6 })} aria-label="Zoom out of island"><Minus/></Button>
        <Button type="button" variant="outline" size="icon" onClick={() => command({ type: "reset" })} aria-label="Reset island view"><RotateCcw/></Button>
      </div>
      <div className="builder-atlas-stage">
        {mounted && webgl && visibleBuilders.length ? <Suspense fallback={<AtlasLoading/>}><BuilderIsland3D developers={visibleBuilders} selectedIndex={selectedIndex} onSelect={selectCity} {...(cameraCommand ? { cameraCommand } : {})}/></Suspense> : <AtlasLoading unavailable={mounted && !webgl}/>} 
      </div>
      <div className="builder-atlas-help">DRAG TO ROTATE · SCROLL OR PINCH TO ZOOM · SELECT A CITY</div>
    </section>

    {selected ? <section className="builder-atlas-detail border-2 border-build-line bg-build-panel" aria-live="polite" aria-label="Selected developer city">
      <div className="flex min-w-0 items-center gap-3">
        {selected.avatarUrl ? <img src={selected.avatarUrl} alt="" className="size-11 border border-build-line object-cover"/> : <span className="grid size-11 place-items-center border border-build-line bg-build-panel-2"><Building2 className="size-5 text-build-cyan"/></span>}
        <div className="min-w-0">
          <p className="font-mono text-[0.58rem] font-bold text-build-cyan">2. SELECTED CITY · {selected.registered ? "REGISTERED" : "GITHUB DISCOVERY"}</p>
          <h3 className="truncate font-build text-3xl normal-case">@{selected.username}</h3>
        </div>
      </div>
      <dl className="builder-atlas-stats">
        <div><dt>City</dt><dd>L{selected.cityLevel}</dd></div>
        <div><dt>Tier</dt><dd>{selected.tier.replaceAll("-", " ")}</dd></div>
        <div><dt>Projects</dt><dd>{selected.projects}</dd></div>
        <div><dt>Git score</dt><dd>{selected.score.toLocaleString()}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {selected.registered ? <Button asChild className="rounded-sm bg-build-cyan text-build-bg hover:bg-build-cyan/85"><Link to="/builder/$username" params={{ username: selected.username }}>See the city? <ArrowUpRight/></Link></Button> : null}
        <Button asChild variant="outline" className="rounded-sm border-build-line bg-transparent text-build-text"><a href={selected.githubUrl} target="_blank" rel="noreferrer"><Github/>GitHub</a></Button>
      </div>
    </section> : null}
    <div className="sr-only" aria-label="Developer cities">{visibleBuilders.map((builder, index) => <button key={builder.id} type="button" onClick={() => selectCity(index)}>Select @{builder.username}, city level {builder.cityLevel}</button>)}</div>
  </div>;
}

function AtlasLoading({ unavailable = false }: { unavailable?: boolean }) {
  return <div className="city-3d-loading"><Building2/><strong>{unavailable ? "3D map unavailable" : "Mapping Blast Island…"}</strong><span>{unavailable ? "Developer details remain available below." : "Placing real Sui developer cities"}</span></div>;
}