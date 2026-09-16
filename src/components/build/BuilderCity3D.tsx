import { Environment, Html, Lightformer, OrbitControls, RoundedBox, Sky } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { BUILDING_LABELS, type BuildingType } from "@/lib/blast-build.config";
import type { BuilderCitySceneProps, CityBuilding } from "./builder-city.types";

const CITY = {
  sky: "#b8e1e3",
  fog: "#d8ece6",
  grass: "#79965f",
  grassDark: "#536b45",
  grassLight: "#96ad6d",
  road: "#292d2d",
  sidewalk: "#d9cdb5",
  sand: "#e8d3a4",
  rock: "#667064",
  ink: "#171410",
  cream: "#f6eed9",
  red: "#d9342b",
  cyan: "#36a7ae",
  glass: "#9bc7ca",
  water: "#5ba9b6",
  waterDeep: "#267d91",
  waterShallow: "#76c7c2",
  trunk: "#6d4935",
  foliage: "#477a4c",
  palm: "#3f8050",
  light: "#ffe5a1",
  path: "#bda98b",
} as const;

const typeColors: Record<BuildingType, string> = {
  dapp: "#e7dcc5",
  move: "#d75a47",
  nft: "#d58b45",
  defi: "#4e9796",
  gaming: "#d4a92f",
  infrastructure: "#75849a",
  tooling: "#69865f",
  automation: "#8c6d95",
  social: "#ce715f",
  meme: "#cf3b31",
  wallet: "#4a8d79",
};

const slots: Array<[number, number]> = [
  [-6.6, -4.6], [-2.2, -4.6], [2.2, -4.6], [6.6, -4.6],
  [-6.6, 0], [6.6, 0], [-6.6, 4.6], [-2.2, 4.6], [2.2, 4.6], [6.6, 4.6],
];

function Building({ building, index, selected, interactive, onSelect }: {
  building: CityBuilding;
  index: number;
  selected: boolean;
  interactive: boolean;
  onSelect: (building: CityBuilding) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const type = building.building_type in typeColors ? building.building_type as BuildingType : "dapp";
  const [x, z] = slots[index] ?? [0, 0];
  const height = Math.min(6.8, 2.1 + building.building_level * 0.28);
  const width = type === "infrastructure" ? 2.5 : type === "gaming" ? 3 : 2.7;
  const depth = type === "defi" ? 2.5 : 2.7;
  const floors = Math.max(2, Math.min(7, Math.ceil(height)));

  useFrame((_, delta) => {
    if (!group.current) return;
    const target = selected || hovered ? 1.06 : 1;
    const next = THREE.MathUtils.lerp(group.current.scale.x, target, 1 - Math.exp(-9 * delta));
    group.current.scale.setScalar(next);
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (interactive) onSelect(building);
  };

  return (
    <group
      ref={group}
      position={[x, 0.3, z]}
      onClick={handleClick}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = interactive ? "pointer" : "default"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
    >
      <mesh position={[0, 0.13, 0]} receiveShadow>
        <boxGeometry args={[3.6, 0.25, 3.6]} />
        <meshStandardMaterial color={selected ? CITY.red : CITY.sidewalk} roughness={0.9} />
      </mesh>
      <RoundedBox args={[width, height, depth]} radius={0.12} smoothness={2} position={[0, height / 2 + 0.25, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={typeColors[type]} roughness={0.68} metalness={0.04} />
      </RoundedBox>
      {Array.from({ length: floors }).map((_, floor) => (
        <group key={floor} position={[0, 0.8 + floor * ((height - 0.65) / floors), 0]}>
          <mesh position={[0, 0, depth / 2 + 0.015]}>
            <boxGeometry args={[width * 0.7, 0.25, 0.035]} />
            <meshStandardMaterial color={CITY.glass} emissive={CITY.glass} emissiveIntensity={0.08} />
          </mesh>
          <mesh position={[width / 2 + 0.015, 0, 0]} rotation-y={Math.PI / 2}>
            <boxGeometry args={[depth * 0.62, 0.25, 0.035]} />
            <meshStandardMaterial color={CITY.glass} emissive={CITY.glass} emissiveIntensity={0.08} />
          </mesh>
        </group>
      ))}
      {type === "infrastructure" ? (
        <group position={[0, height + 0.6, 0]}>
          <mesh castShadow><cylinderGeometry args={[0.08, 0.08, 1.4, 8]} /><meshStandardMaterial color={CITY.ink} /></mesh>
          <mesh position={[0, 0.65, 0]}><sphereGeometry args={[0.18, 12, 8]} /><meshStandardMaterial color={CITY.red} emissive={CITY.red} emissiveIntensity={0.8} /></mesh>
        </group>
      ) : type === "defi" ? (
        <mesh position={[0, height + 0.58, 0]} castShadow><cylinderGeometry args={[0.7, 0.95, 0.65, 8]} /><meshStandardMaterial color={CITY.cream} /></mesh>
      ) : (
        <mesh position={[0, height + 0.5, 0]} castShadow rotation-y={Math.PI / 4}>
          <boxGeometry args={[width * 0.58, 0.55, depth * 0.58]} />
          <meshStandardMaterial color={CITY.ink} roughness={0.65} />
        </mesh>
      )}
      {(selected || hovered) && (
        <Html position={[0, height + 1.35, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div className="city-3d-label">
            <strong>@{building.builder_repositories?.owner ?? "builder"} / {building.builder_repositories?.name ?? BUILDING_LABELS[type]}</strong>
            <span>DEV L{building.building_level} · SUI {building.builder_repositories?.sui_relevance ?? 0}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return <group position={position} scale={scale}>
    <mesh position-y={0.65} castShadow><cylinderGeometry args={[0.14, 0.2, 1.3, 7]} /><meshStandardMaterial color={CITY.trunk} /></mesh>
    <mesh position-y={1.65} castShadow><icosahedronGeometry args={[0.8, 1]} /><meshStandardMaterial color={CITY.foliage} flatShading roughness={1} /></mesh>
  </group>;
}

function Palm({ position, scale = 1, rotation = 0 }: { position: [number, number, number]; scale?: number; rotation?: number }) {
  return <group position={position} scale={scale} rotation-y={rotation}>
    <mesh position-y={1.15} rotation-z={-0.08} castShadow>
      <cylinderGeometry args={[0.12, 0.2, 2.3, 7]} />
      <meshStandardMaterial color={CITY.trunk} roughness={1} />
    </mesh>
    {Array.from({ length: 6 }).map((_, index) => <mesh key={index} position={[0, 2.3, 0]} rotation-y={(Math.PI * 2 * index) / 6} rotation-z={0.72} castShadow>
      <coneGeometry args={[0.42, 2.25, 5]} />
      <meshStandardMaterial color={index % 2 ? CITY.palm : CITY.foliage} flatShading roughness={1} />
    </mesh>)}
    <mesh position={[0, 2.08, 0]} castShadow><sphereGeometry args={[0.28, 8, 6]} /><meshStandardMaterial color={CITY.trunk} /></mesh>
  </group>;
}

function Lamp({ position }: { position: [number, number, number] }) {
  return <group position={position}>
    <mesh position-y={0.8} castShadow><cylinderGeometry args={[0.045, 0.07, 1.6, 7]} /><meshStandardMaterial color={CITY.ink} /></mesh>
    <mesh position-y={1.65}><sphereGeometry args={[0.14, 10, 8]} /><meshStandardMaterial color={CITY.light} emissive={CITY.light} emissiveIntensity={1.5} /></mesh>
  </group>;
}

function ruggedIslandShape() {
  const shape = new THREE.Shape();
  const points = Array.from({ length: 48 }, (_, index) => {
    const angle = (index / 48) * Math.PI * 2;
    const noise = 1 + Math.sin(angle * 5 + 0.7) * 0.055 + Math.sin(angle * 11) * 0.025;
    const eastCape = Math.max(0, Math.cos(angle)) ** 8 * 2.4;
    const westCape = Math.max(0, -Math.cos(angle)) ** 10 * 1.25;
    return new THREE.Vector2(
      Math.cos(angle) * (13.6 * noise + eastCape + westCape),
      Math.sin(angle) * (10.4 * noise) + Math.sin(angle * 3) * 0.34,
    );
  });
  const first = points[0];
  if (!first) return shape;
  shape.moveTo(first.x, first.y);
  points.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  shape.closePath();
  return shape;
}

function IslandLayer({ y, depth, scale, color, bevel = false, opacity = 1 }: { y: number; depth: number; scale: number; color: string; bevel?: boolean; opacity?: number }) {
  const shape = useMemo(ruggedIslandShape, []);
  return <mesh position={[0, y, 0]} rotation-x={-Math.PI / 2} scale={[scale, scale, 1]} receiveShadow castShadow>
    <extrudeGeometry args={[shape, { depth, bevelEnabled: bevel, bevelSize: bevel ? 0.22 : 0, bevelThickness: bevel ? 0.15 : 0, bevelSegments: 1, curveSegments: 20 }]} />
    <meshStandardMaterial color={color} roughness={0.94} flatShading transparent={opacity < 1} opacity={opacity} />
  </mesh>;
}

function SatelliteCity({ position, color, rotation = 0 }: { position: [number, number, number]; color: string; rotation?: number }) {
  const towers = [
    { x: -0.9, z: 0.25, h: 1.75, w: 1.05 },
    { x: 0.15, z: -0.2, h: 2.65, w: 1.15 },
    { x: 1.15, z: 0.35, h: 1.35, w: 0.9 },
  ];
  return <group position={position} rotation-y={rotation}>
    <mesh position-y={0.05} receiveShadow><cylinderGeometry args={[2.25, 2.45, 0.12, 10]} /><meshStandardMaterial color={CITY.sidewalk} /></mesh>
    {towers.map((tower, index) => <group key={index} position={[tower.x, tower.h / 2 + 0.12, tower.z]}>
      <mesh castShadow receiveShadow><boxGeometry args={[tower.w, tower.h, tower.w]} /><meshStandardMaterial color={index === 1 ? color : CITY.cream} roughness={0.72} /></mesh>
      <mesh position={[0, 0.1, tower.w / 2 + 0.012]}><boxGeometry args={[tower.w * 0.58, tower.h * 0.52, 0.025]} /><meshStandardMaterial color={CITY.glass} emissive={CITY.glass} emissiveIntensity={0.1} /></mesh>
      <mesh position-y={tower.h / 2 + 0.18} rotation-y={Math.PI / 4}><boxGeometry args={[tower.w * 0.72, 0.22, tower.w * 0.72]} /><meshStandardMaterial color={CITY.ink} /></mesh>
    </group>)}
  </group>;
}

function UrbanSkyline({ level }: { level: number }) {
  const blocks = useMemo(() => {
    const candidates: Array<{ x: number; z: number; height: number; width: number; tone: string }> = [];
    const columns = [-9.2, -7.6, -5.4, -3.5, 3.5, 5.4, 7.6, 9.2];
    const rows = [-7.2, -2.55, 2.55, 6.2];
    rows.forEach((z, row) => columns.forEach((x, column) => {
      const seed = (row * 17 + column * 11 + level * 3) % 13;
      const height = 1.5 + (seed / 12) * 3.8 + Math.min(level, 12) * 0.08;
      candidates.push({ x, z, height, width: 0.88 + (seed % 4) * 0.12, tone: (row + column) % 5 === 0 ? CITY.cyan : (row + column) % 7 === 0 ? CITY.red : CITY.cream });
    }));
    return candidates.slice(0, Math.min(candidates.length, 18 + Math.max(0, level) * 2));
  }, [level]);
  return <group>
    {blocks.map((block, index) => <group key={index} position={[block.x, 0.75, block.z]}>
      <mesh position-y={block.height / 2} castShadow receiveShadow>
        <boxGeometry args={[block.width, block.height, block.width * 0.92]} />
        <meshStandardMaterial color={block.tone} roughness={0.72} />
      </mesh>
      {Array.from({ length: Math.max(2, Math.floor(block.height)) }).map((_, floor) => <mesh key={floor} position={[0, 0.75 + floor * 0.72, block.width * 0.47]}>
        <boxGeometry args={[block.width * 0.58, 0.16, 0.035]} />
        <meshStandardMaterial color={CITY.glass} emissive={CITY.glass} emissiveIntensity={0.11} />
      </mesh>)}
      <mesh position-y={block.height + 0.1} rotation-y={Math.PI / 4} castShadow>
        <boxGeometry args={[block.width * 0.72, 0.2, block.width * 0.72]} /><meshStandardMaterial color={CITY.ink} roughness={0.75} />
      </mesh>
    </group>)}
  </group>;
}

function SuiWaveLagoon() {
  return <group position={[0, 0.67, 9.25]} rotation-y={Math.PI}>
    <mesh rotation-x={-Math.PI / 2} rotation-z={0.3}><torusGeometry args={[2.7, 0.4, 8, 34, Math.PI * 0.74]} /><meshStandardMaterial color={CITY.waterShallow} roughness={0.22} metalness={0.08} /></mesh>
    <mesh position={[0.35, 0.02, 1.05]} rotation-x={-Math.PI / 2} rotation-z={0.15}><torusGeometry args={[1.85, 0.3, 8, 28, Math.PI * 0.68]} /><meshStandardMaterial color={CITY.water} roughness={0.2} /></mesh>
  </group>;
}

function MountainRidge() {
  const peaks: Array<readonly [number, number, number, number, string]> = [
    [-8.6, 1.2, 5.8, 2.8, CITY.grassDark], [-6.1, 1.35, 6.7, 3.2, CITY.rock],
    [-3.8, 1.05, 7.4, 2.35, CITY.grassDark], [4.2, 1.1, 7.2, 2.5, CITY.rock],
    [7.1, 1.25, 6.1, 2.95, CITY.grassDark], [9.4, 0.8, 4.7, 1.9, CITY.rock],
  ];
  return <group>
    {peaks.map(([x, y, z, size, color], index) => <group key={index} position={[x, y, z]} scale={[size, size * 0.82, size]}>
      <mesh castShadow receiveShadow rotation-y={index * 0.37}>
        <coneGeometry args={[1, 1.55, 7, 3]} /><meshStandardMaterial color={color} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 0.72, 0]} scale={[0.52, 0.38, 0.52]} castShadow>
        <coneGeometry args={[1, 1.05, 7]} /><meshStandardMaterial color={CITY.sand} roughness={1} flatShading />
      </mesh>
    </group>)}
  </group>;
}

function IslandTerrain() {
  const palms = useMemo<Array<{ position: [number, number, number]; scale: number; rotation: number }>>(() => [
    { position: [-10.1, 0.57, -2.8], scale: 0.76, rotation: 0.2 }, { position: [10.2, 0.57, -2.6], scale: 0.7, rotation: 1.8 },
    { position: [-9.4, 0.57, 4.1], scale: 0.62, rotation: 0.8 }, { position: [9.5, 0.57, 4.2], scale: 0.68, rotation: 2.5 },
    { position: [-6.2, 0.57, 10.3], scale: 0.76, rotation: 1.2 }, { position: [6.1, 0.57, 10.4], scale: 0.72, rotation: 2.9 },
    { position: [-4.3, 0.57, -9.4], scale: 0.62, rotation: 0.5 }, { position: [4.2, 0.57, -9.5], scale: 0.65, rotation: 2.2 },
  ], []);
  return <>
    <mesh position-y={-1.55} receiveShadow><cylinderGeometry args={[48, 48, 0.65, 48]} /><meshStandardMaterial color={CITY.waterDeep} roughness={0.34} metalness={0.08} /></mesh>
    <mesh position-y={-1.18} receiveShadow><cylinderGeometry args={[23, 25, 0.18, 40]} /><meshStandardMaterial color={CITY.water} transparent opacity={0.62} roughness={0.25} /></mesh>
    <IslandLayer y={-1.03} depth={0.12} scale={1.18} color={CITY.waterShallow} opacity={0.7} />
    <IslandLayer y={-0.99} depth={0.1} scale={1.12} color={CITY.cream} opacity={0.72} />
    <IslandLayer y={-1.08} depth={1.02} scale={1.055} color={CITY.rock} bevel />
    <IslandLayer y={-0.19} depth={0.48} scale={1.01} color={CITY.sand} bevel />
    <IslandLayer y={0.2} depth={0.31} scale={0.945} color={CITY.grass} bevel />
    <MountainRidge />
    <SuiWaveLagoon />
    <group position={[0, 0.6, -13.1]}>
      <mesh receiveShadow><boxGeometry args={[1.7, 0.18, 4.2]} /><meshStandardMaterial color={CITY.path} roughness={1} /></mesh>
      {[-0.68, 0.68].map((x) => <mesh key={x} position={[x, -0.42, 0]}><cylinderGeometry args={[0.09, 0.11, 1, 7]} /><meshStandardMaterial color={CITY.trunk} /></mesh>)}
    </group>
    {palms.map((palm, index) => <Palm key={index} {...palm} />)}
    {[-1, 1].flatMap((side) => [0, 1, 2].map((index) => <mesh key={`${side}-${index}`} position={[side * (11.1 - index * 0.48), 0.55, 8.2 + index * 1.05]} scale={0.42 + index * 0.08} castShadow>
      <dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color={index % 2 ? CITY.rock : CITY.sand} flatShading roughness={1} />
    </mesh>))}
  </>;
}

function CityInfrastructure({ level }: { level: number }) {
  return <group>
    <mesh position={[0, 0.62, -0.2]} receiveShadow><boxGeometry args={[2.55, 0.14, 16.1]} /><meshStandardMaterial color={CITY.road} roughness={0.94} /></mesh>
    <mesh position={[0, 0.63, 0]} receiveShadow><boxGeometry args={[18.6, 0.14, 2.25]} /><meshStandardMaterial color={CITY.road} roughness={0.94} /></mesh>
    {[-5.3, 5.3].map((x) => <mesh key={x} position={[x, 0.72, 0]}><boxGeometry args={[0.14, 0.035, 2.27]} /><meshStandardMaterial color={CITY.cream} /></mesh>)}
    {[-4.7, 4.4].map((z) => <mesh key={z} position={[0, 0.72, z]}><boxGeometry args={[2.57, 0.035, 0.14]} /><meshStandardMaterial color={CITY.cream} /></mesh>)}
    {[-5.7, -2.9, 2.7, 5.5].map((z) => <mesh key={`lane-${z}`} position={[0, 0.72, z]}><boxGeometry args={[0.11, 0.035, 1.1]} /><meshStandardMaterial color={CITY.sand} /></mesh>)}
    {[-6.8, -3.4, 3.4, 6.8].map((x) => <mesh key={`cross-${x}`} position={[x, 0.72, 0]}><boxGeometry args={[1.25, 0.035, 0.11]} /><meshStandardMaterial color={CITY.sand} /></mesh>)}
    <UrbanSkyline level={level} />
    <SatelliteCity position={[-8.25, 0.61, 7.35]} color={CITY.red} rotation={0.18} />
    <SatelliteCity position={[8.15, 0.61, 7.2]} color={CITY.cyan} rotation={-0.22} />
    <SatelliteCity position={[0, 0.61, -9.35]} color={CITY.red} rotation={Math.PI} />
  </group>;
}

function CameraRig({ cameraCommand, controls }: { cameraCommand: BuilderCitySceneProps["cameraCommand"]; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const goal = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const orbit = controls.current;
    if (!orbit || !cameraCommand) return;
    if (cameraCommand.type === "rotate") {
      const offset = camera.position.clone().sub(orbit.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraCommand.amount);
      goal.current = { position: orbit.target.clone().add(offset), target: orbit.target.clone() };
    } else if (cameraCommand.type === "zoom") {
      const direction = camera.position.clone().sub(orbit.target).normalize();
      const distance = THREE.MathUtils.clamp(camera.position.distanceTo(orbit.target) + cameraCommand.amount, 11, 48);
      goal.current = { position: orbit.target.clone().add(direction.multiplyScalar(distance)), target: orbit.target.clone() };
    } else {
      goal.current = cameraCommand.preset === "helicopter"
        ? { position: new THREE.Vector3(0.01, 38, 11), target: new THREE.Vector3(0, 0.7, 0) }
        : { position: new THREE.Vector3(18, 17, 23), target: new THREE.Vector3(0, 1.4, 0) };
    }
  }, [camera, cameraCommand, controls]);

  useFrame((_, delta) => {
    const orbit = controls.current;
    const next = goal.current;
    if (!orbit || !next) return;
    const blend = 1 - Math.exp(-5 * Math.min(delta, 0.05));
    camera.position.lerp(next.position, blend);
    orbit.target.lerp(next.target, blend);
    orbit.update();
    if (camera.position.distanceTo(next.position) < 0.04 && orbit.target.distanceTo(next.target) < 0.04) goal.current = null;
  });
  return null;
}

function Headquarters({ username, level, profileEnabled, onOpen }: { username: string; level: number; profileEnabled: boolean; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);
  return <group
    position={[0, 0.25, 0]}
    onClick={(event) => { event.stopPropagation(); if (profileEnabled) onOpen(); }}
    onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = profileEnabled ? "pointer" : "default"; }}
    onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
  >
    <mesh position-y={0.15} receiveShadow><cylinderGeometry args={[3.05, 3.3, 0.3, 8]} /><meshStandardMaterial color={CITY.sidewalk} /></mesh>
    <RoundedBox args={[4.6, 2.7, 3.8]} radius={0.18} smoothness={3} position={[0, 1.65, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={hovered ? CITY.cream : "#eadfc7"} roughness={0.72} />
    </RoundedBox>
    <mesh position={[0, 1.55, 1.92]}><boxGeometry args={[1.15, 1.45, 0.08]} /><meshStandardMaterial color={CITY.red} /></mesh>
    <mesh position={[0, 2.15, 1.98]}><boxGeometry args={[0.48, 0.48, 0.05]} /><meshStandardMaterial color={CITY.cream} /></mesh>
    <mesh position={[0, 3.33, 0]} rotation-y={Math.PI / 4} castShadow><boxGeometry args={[3.8, 0.55, 3.15]} /><meshStandardMaterial color={CITY.ink} /></mesh>
    <Html position={[0, 3.95, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
      <div className="city-3d-label city-3d-label-hq"><strong>BUILDER HQ</strong><span>@{username} · LVL {level}</span></div>
    </Html>
  </group>;
}

function Scene({ buildings, username, level, interactive, selectedId, profileEnabled, onSelect, onOpenProfile, cameraCommand, visibleLevel }: BuilderCitySceneProps) {
  const treePositions = useMemo<Array<[number, number, number]>>(() => [
    [-9.2, 0.28, -7], [-7.6, 0.28, 7], [-4.3, 0.28, 7.1], [4.3, 0.28, 7.1], [7.7, 0.28, 7], [9.1, 0.28, -7],
    [-9.4, 0.28, 2.2], [9.4, 0.28, 2.3], [-4.6, 0.28, -7], [4.7, 0.28, -7],
  ], []);
  const { gl } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const visibleBuildings = visibleLevel === null || visibleLevel === undefined ? buildings : buildings.filter((building) => building.building_level === visibleLevel);

  return <>
    <color attach="background" args={[CITY.sky]} />
    <fog attach="fog" args={[CITY.fog, 40, 78]} />
    <Sky distance={450000} sunPosition={[-8, 14, 8]} inclination={0.54} azimuth={0.2} turbidity={7} rayleigh={1.8} mieCoefficient={0.004} mieDirectionalG={0.78} />
    <hemisphereLight args={[CITY.sky, CITY.grassDark, 1.25]} />
    <directionalLight position={[-10, 18, 11]} intensity={2.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} />
    <Environment>
      <Lightformer intensity={1.8} position={[0, 10, 4]} scale={[20, 10, 1]} />
      <Lightformer intensity={0.7} color={CITY.cyan} position={[-10, 3, -4]} rotation-y={Math.PI / 2} scale={[12, 3, 1]} />
    </Environment>

    <IslandTerrain />
    <CityInfrastructure level={level} />
    {treePositions.map((position, index) => <Tree key={index} position={[position[0], 0.56, position[2]]} scale={0.62 + (index % 3) * 0.08} />)}
    {[-7.7, -4.7, 4.7, 7.7].flatMap((x) => [-1.7, 1.7].map((z) => <Lamp key={`${x}-${z}`} position={[x, 0.58, z]} />))}

    <group position-y={0.31}>
      <Headquarters username={username} level={level} profileEnabled={profileEnabled} onOpen={onOpenProfile} />
    {visibleBuildings.slice(0, 10).map((building) => {
      const index = buildings.findIndex((candidate) => candidate.id === building.id);
      return <Building key={building.id} building={building} index={index} selected={selectedId === building.id} interactive={interactive} onSelect={onSelect} />;
    })}
    </group>

    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 1.4, 0]}
      minDistance={15}
      maxDistance={52}
      minPolarAngle={0.08}
      maxPolarAngle={1.45}
      enablePan={false}
      dampingFactor={0.08}
      onStart={() => { gl.domElement.style.cursor = "grabbing"; }}
      onEnd={() => { gl.domElement.style.cursor = "grab"; }}
    />
    <CameraRig cameraCommand={cameraCommand} controls={controls} />
  </>;
}

export default function BuilderCity3D(props: BuilderCitySceneProps & { resetKey: number }) {
  return <Canvas
    key={props.resetKey}
    shadows
    dpr={[1, 1.35]}
    camera={{ position: [14, 29, 30], fov: 43, near: 0.1, far: 140 }}
    gl={{ antialias: true, alpha: false, powerPreference: "default" }}
    onPointerMissed={() => document.body.style.cursor = "default"}
  >
    <Scene {...props} />
  </Canvas>;
}