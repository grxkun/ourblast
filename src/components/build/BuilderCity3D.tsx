import { Environment, Html, Lightformer, OrbitControls, RoundedBox, Sky } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { BUILDING_LABELS, type BuildingType } from "@/lib/blast-build.config";
import type { BuilderCitySceneProps, CityBuilding } from "./builder-city.types";

const CITY = {
  sky: "#b8d9df",
  fog: "#d7e7e3",
  grass: "#79965f",
  grassDark: "#536b45",
  road: "#292d2d",
  sidewalk: "#d9cdb5",
  ink: "#171410",
  cream: "#f6eed9",
  red: "#d9342b",
  cyan: "#36a7ae",
  glass: "#9bc7ca",
  water: "#5ba9b6",
  trunk: "#6d4935",
  foliage: "#477a4c",
  light: "#ffe5a1",
  hill: "#6e8c67",
  skyline: "#768b86",
  skylineDark: "#526664",
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

function Lamp({ position }: { position: [number, number, number] }) {
  return <group position={position}>
    <mesh position-y={0.8} castShadow><cylinderGeometry args={[0.045, 0.07, 1.6, 7]} /><meshStandardMaterial color={CITY.ink} /></mesh>
    <mesh position-y={1.65}><sphereGeometry args={[0.14, 10, 8]} /><meshStandardMaterial color={CITY.light} emissive={CITY.light} emissiveIntensity={1.5} /></mesh>
  </group>;
}

function DistantSkyline() {
  const towers = useMemo(() => Array.from({ length: 22 }, (_, index) => {
    const side = index < 11 ? -1 : 1;
    const lane = index % 11;
    return {
      x: -15 + lane * 3,
      z: side * (13.4 + (lane % 3) * 1.05),
      height: 2.4 + ((index * 17) % 6) * 0.68,
      width: 1.7 + (index % 3) * 0.38,
      color: index % 3 === 0 ? CITY.skylineDark : CITY.skyline,
    };
  }), []);
  return <group>
    {towers.map((tower, index) => <group key={index} position={[tower.x, tower.height / 2 - 0.1, tower.z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[tower.width, tower.height, tower.width * 0.8]} />
        <meshStandardMaterial color={tower.color} roughness={0.88} />
      </mesh>
      {Array.from({ length: Math.max(2, Math.floor(tower.height)) }).map((_, floor) => <mesh key={floor} position={[0, -tower.height / 2 + 0.65 + floor * 0.72, sideFacing(tower.z)]}>
        <boxGeometry args={[tower.width * 0.58, 0.16, 0.035]} />
        <meshStandardMaterial color={CITY.glass} emissive={CITY.glass} emissiveIntensity={0.13} />
      </mesh>)}
    </group>)}
  </group>;
}

function sideFacing(z: number) {
  return z < 0 ? 0.82 : -0.82;
}

function Landscape() {
  const hills = useMemo(() => Array.from({ length: 13 }, (_, index) => ({
    x: -24 + index * 4,
    z: index % 2 === 0 ? -20 : 20,
    scale: 3.2 + (index % 4) * 0.75,
  })), []);
  return <>
    <mesh position-y={-0.9} receiveShadow><cylinderGeometry args={[25, 27, 1.8, 12]} /><meshStandardMaterial color={CITY.grassDark} roughness={1} /></mesh>
    <mesh position-y={-0.05} receiveShadow><boxGeometry args={[45, 0.42, 34]} /><meshStandardMaterial color={CITY.grass} roughness={1} /></mesh>
    {hills.map((hill, index) => <mesh key={index} position={[hill.x, 0.45, hill.z]} scale={[hill.scale, 1.1 + (index % 3) * 0.35, hill.scale]} castShadow>
      <dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color={index % 2 ? CITY.hill : CITY.grassDark} flatShading roughness={1} />
    </mesh>)}
    <DistantSkyline />
  </>;
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

    <Landscape />
    <mesh position-y={-0.55} receiveShadow><cylinderGeometry args={[16.7, 17.3, 1.2, 8]} /><meshStandardMaterial color={CITY.grassDark} roughness={1} /></mesh>
    <mesh position-y={0} receiveShadow><boxGeometry args={[25.5, 0.35, 20]} /><meshStandardMaterial color={CITY.grass} roughness={1} /></mesh>

    <mesh position={[0, 0.22, 0]} receiveShadow><boxGeometry args={[3.1, 0.16, 20.1]} /><meshStandardMaterial color={CITY.road} roughness={0.92} /></mesh>
    <mesh position={[0, 0.23, 0]} receiveShadow><boxGeometry args={[25.6, 0.16, 2.6]} /><meshStandardMaterial color={CITY.road} roughness={0.92} /></mesh>
    {[-8.2, -4.1, 4.1, 8.2].map((z) => <mesh key={`road-z-${z}`} position={[0, 0.32, z]} receiveShadow><boxGeometry args={[25.5, 0.09, 0.16]} /><meshStandardMaterial color={CITY.cream} /></mesh>)}
    {[-10.2, -6.1, -2, 2, 6.1, 10.2].map((x) => <mesh key={`road-x-${x}`} position={[x, 0.32, 0]} receiveShadow><boxGeometry args={[0.16, 0.09, 2.62]} /><meshStandardMaterial color={CITY.cream} /></mesh>)}

    <mesh position={[-10.25, 0.34, 7.2]} receiveShadow><cylinderGeometry args={[2.15, 2.15, 0.14, 24]} /><meshStandardMaterial color={CITY.water} roughness={0.25} metalness={0.1} /></mesh>
    <mesh position={[-10.25, 0.42, 7.2]} rotation-x={-Math.PI / 2}><torusGeometry args={[2.25, 0.22, 8, 32]} /><meshStandardMaterial color={CITY.sidewalk} /></mesh>
    {treePositions.map((position, index) => <Tree key={index} position={position} scale={0.78 + (index % 3) * 0.1} />)}
    {[-7.7, -4.7, 4.7, 7.7].flatMap((x) => [-1.7, 1.7].map((z) => <Lamp key={`${x}-${z}`} position={[x, 0.32, z]} />))}

    <Headquarters username={username} level={level} profileEnabled={profileEnabled} onOpen={onOpenProfile} />
    {visibleBuildings.slice(0, 10).map((building) => {
      const index = buildings.findIndex((candidate) => candidate.id === building.id);
      return <Building key={building.id} building={building} index={index} selected={selectedId === building.id} interactive={interactive} onSelect={onSelect} />;
    })}

    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 1.4, 0]}
      minDistance={15}
      maxDistance={48}
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
    camera={{ position: [18, 17, 23], fov: 42, near: 0.1, far: 120 }}
    gl={{ antialias: true, alpha: false, powerPreference: "default" }}
    onPointerMissed={() => document.body.style.cursor = "default"}
  >
    <Scene {...props} />
  </Canvas>;
}