import { Environment, Html, Lightformer, OrbitControls, Sky } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import type { IslandCameraCommand, IslandDeveloper } from "./builder-atlas.types";

const MAP = {
  sky: "#b8e1e3", fog: "#d8ece6", ocean: "#267d91", water: "#5ba9b6",
  sand: "#e8d3a4", grass: "#79965f", grassDark: "#536b45", cream: "#f6eed9",
  ink: "#171410", red: "#d9342b", cyan: "#36a7ae", glass: "#9bc7ca",
  road: "#4a4c48", trunk: "#6d4935", palm: "#477a4c",
} as const;

type CityLayout = IslandDeveloper & { x: number; z: number; scale: number; towers: number };
type Tower = { cityIndex: number; x: number; z: number; height: number; width: number; tone: number };

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0) / 4294967295;
}

function cityLayouts(developers: IslandDeveloper[]) {
  const maxScore = Math.max(1, ...developers.map((developer) => developer.score));
  return developers.slice(0, 100).map((developer, index): CityLayout => {
    const row = Math.floor(index / 10);
    const column = index % 10;
    const z = -10.2 + row * 2.25;
    const normalizedZ = (z + 10.2) / 20.25;
    const halfWidth = 10.2 * (0.66 + Math.sin(normalizedZ * Math.PI) * 0.34) * (normalizedZ > 0.82 ? 1.55 - normalizedZ : 1);
    let x = -halfWidth + (column / 9) * halfWidth * 2 + (hash(developer.username) - 0.5) * 0.55;
    const volcanoDistance = Math.hypot(x, z - 1.8);
    if (volcanoDistance < 4.6) x += (x < 0 ? -1 : 1) * (4.8 - volcanoDistance);
    const power = Math.sqrt(Math.max(0, developer.score) / maxScore);
    return { ...developer, x, z, scale: 0.48 + power * 0.72, towers: Math.max(1, Math.min(4, 1 + Math.floor(power * 4))) };
  });
}

function suiDropShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 15.4);
  shape.bezierCurveTo(2.1, 11.2, 12.4, 3, 12.8, -3.2);
  shape.bezierCurveTo(13.2, -9.9, 7.8, -14.6, 0, -14.9);
  shape.bezierCurveTo(-7.8, -14.6, -13.2, -9.9, -12.8, -3.2);
  shape.bezierCurveTo(-12.4, 3, -2.1, 11.2, 0, 15.4);
  shape.closePath();
  return shape;
}

function IslandLayer({ y, depth, scale, color }: { y: number; depth: number; scale: number; color: string }) {
  const shape = useMemo(suiDropShape, []);
  return <mesh position={[0, y, 0]} rotation-x={-Math.PI / 2} scale={[scale, scale, 1]} receiveShadow>
    <extrudeGeometry args={[shape, { depth, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.12, bevelSegments: 1, curveSegments: 20 }]} />
    <meshStandardMaterial color={color} roughness={0.94} flatShading />
  </mesh>;
}

function Road({ position, size, rotation = 0 }: { position: [number, number, number]; size: [number, number]; rotation?: number }) {
  const dashCount = Math.max(2, Math.floor(size[1] / 2.2));
  return <group position={position} rotation-y={rotation}>
    <mesh receiveShadow><boxGeometry args={[size[0], 0.12, size[1]]} /><meshStandardMaterial color={MAP.road} roughness={0.94} /></mesh>
    {Array.from({ length: dashCount }).map((_, index) => <mesh key={index} position={[0, 0.075, -size[1] / 2 + 1.05 + index * 2.2]}>
      <boxGeometry args={[0.08, 0.025, 0.72]} /><meshStandardMaterial color={MAP.sand} roughness={0.8} />
    </mesh>)}
  </group>;
}

function RoadNetwork() {
  return <group>
    <Road position={[-7.25, 0.2, 0]} size={[0.62, 19.5]} />
    <Road position={[7.25, 0.2, 0]} size={[0.62, 19.5]} />
    <Road position={[0, 0.2, -7.9]} size={[0.62, 20.5]} rotation={Math.PI / 2} />
    <Road position={[0, 0.2, 7.9]} size={[0.62, 16]} rotation={Math.PI / 2} />
    <Road position={[0, 0.2, -2.6]} size={[0.52, 20]} rotation={Math.PI / 2} />
    <mesh position={[0, 0.25, 1.8]} rotation-x={Math.PI / 2}>
      <torusGeometry args={[5.05, 0.28, 6, 64]} /><meshStandardMaterial color={MAP.road} roughness={0.94} />
    </mesh>
    <mesh position={[0, 0.29, 1.8]} rotation-x={Math.PI / 2}>
      <torusGeometry args={[5.05, 0.035, 4, 64]} /><meshStandardMaterial color={MAP.sand} roughness={0.8} />
    </mesh>
    {[[-7.25, -7.9], [7.25, -7.9], [-7.25, 7.9], [7.25, 7.9]].map(([x, z], index) => <mesh key={index} position={[x, 0.29, z]} rotation-x={Math.PI / 2}>
      <circleGeometry args={[0.52, 16]} /><meshStandardMaterial color={MAP.cream} roughness={0.82} />
    </mesh>)}
  </group>;
}

function TropicalIsland() {
  const palms = [[-10, -5], [10, -5], [-8.5, 6.5], [8.5, 6.5], [-5.5, 11], [5.5, 11]] as const;
  return <>
    <mesh position-y={-1.45} receiveShadow><cylinderGeometry args={[55, 55, 0.7, 48]} /><meshStandardMaterial color={MAP.ocean} roughness={0.3} /></mesh>
    <mesh position-y={-1.05} receiveShadow><cylinderGeometry args={[28, 31, 0.15, 48]} /><meshStandardMaterial color={MAP.water} transparent opacity={0.62} /></mesh>
    <IslandLayer y={-0.95} depth={0.72} scale={1.06} color={MAP.sand} />
    <IslandLayer y={-0.32} depth={0.4} scale={1} color={MAP.grass} />
    <RoadNetwork />
    <mesh position={[0, 0.12, 11]} rotation-x={-Math.PI / 2}><torusGeometry args={[2.15, 0.38, 8, 32, Math.PI * 0.78]} /><meshStandardMaterial color={MAP.water} /></mesh>
    <Volcano />
    {palms.map(([x, z], index) => <group key={index} position={[x, 0.16, z]} scale={0.72} rotation-y={index}>
      <mesh position-y={1.1} rotation-z={0.08} castShadow><cylinderGeometry args={[0.11, 0.18, 2.2, 6]} /><meshStandardMaterial color={MAP.trunk} /></mesh>
      {Array.from({ length: 5 }).map((_, leaf) => <mesh key={leaf} position-y={2.2} rotation-y={leaf * Math.PI * 0.4} rotation-z={0.75}><coneGeometry args={[0.35, 1.8, 5]} /><meshStandardMaterial color={MAP.palm} flatShading /></mesh>)}
    </group>)}
  </>;
}

function Volcano() {
  const smoke = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!smoke.current) return;
    smoke.current.position.y = Math.sin(state.clock.elapsedTime * 0.75) * 0.16;
    smoke.current.rotation.y = state.clock.elapsedTime * 0.08;
  });
  return <group position={[0, 0.14, 1.8]}>
    <mesh position-y={0.72} castShadow receiveShadow>
      <coneGeometry args={[5, 1.45, 12, 3, false]} />
      <meshStandardMaterial color={MAP.grassDark} roughness={1} flatShading />
    </mesh>
    <mesh position-y={1.65} castShadow receiveShadow rotation-y={0.22}>
      <coneGeometry args={[3.45, 2.35, 11, 4, false]} />
      <meshStandardMaterial color={MAP.trunk} roughness={1} flatShading />
    </mesh>
    <mesh position-y={2.75} castShadow receiveShadow rotation-y={0.08}>
      <cylinderGeometry args={[1.2, 2.15, 1.2, 11, 2, true]} />
      <meshStandardMaterial color={MAP.road} roughness={0.96} flatShading />
    </mesh>
    <mesh position-y={3.38} rotation-x={Math.PI / 2}>
      <torusGeometry args={[0.92, 0.42, 8, 18]} />
      <meshStandardMaterial color={MAP.ink} roughness={0.9} flatShading />
    </mesh>
    <mesh position-y={3.35} rotation-x={-Math.PI / 2}>
      <circleGeometry args={[0.76, 18]} />
      <meshStandardMaterial color={MAP.red} emissive={MAP.red} emissiveIntensity={1.8} roughness={0.36} />
    </mesh>
    <mesh position={[0.56, 1.74, 1.88]} rotation={[0.12, -0.28, -0.35]}>
      <boxGeometry args={[0.34, 4.1, 0.1]} />
      <meshStandardMaterial color={MAP.red} emissive={MAP.red} emissiveIntensity={1.15} />
    </mesh>
    <mesh position={[-1.55, 1.12, 1.52]} rotation={[0.1, 0.22, 0.72]}>
      <boxGeometry args={[0.24, 3.1, 0.08]} />
      <meshStandardMaterial color={MAP.red} emissive={MAP.red} emissiveIntensity={0.9} />
    </mesh>
    {[[2.7, .72, -.5, .62], [-2.45, .58, .82, .5], [1.8, .48, 2.75, .42], [-3.2, .4, -1.5, .38]].map(([x, y, z, size], index) => <mesh key={`rock-${index}`} position={[x ?? 0, y ?? 0, z ?? 0]} scale={size ?? 1} castShadow>
      <dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color={MAP.road} roughness={1} flatShading />
    </mesh>)}
    <group ref={smoke} position={[0, 4.38, 0]}>
      {[[0, 0, 0, .62], [.45, .7, .1, .48], [-.3, 1.25, -.1, .4], [.28, 1.75, 0, .3]].map(([x, y, z, size], index) => <mesh key={index} position={[x ?? 0, y ?? 0, z ?? 0]} scale={size ?? 1}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={MAP.cream} transparent opacity={0.7 - index * 0.1} roughness={1} flatShading />
      </mesh>)}
    </group>
  </group>;
}

function CityInstances({ cities, selectedIndex, onSelect }: { cities: CityLayout[]; selectedIndex: number; onSelect: (index: number) => void }) {
  const towers = useMemo(() => cities.flatMap((city, cityIndex) => Array.from({ length: city.towers }, (_, towerIndex): Tower => {
    const angle = towerIndex * 2.1 + hash(`${city.username}-${towerIndex}`);
    const radius = towerIndex === 0 ? 0 : 0.42 * city.scale;
    return { cityIndex, x: city.x + Math.cos(angle) * radius, z: city.z + Math.sin(angle) * radius, height: (0.5 + city.scale * (0.72 + hash(`${city.id}-h-${towerIndex}`) * 1.2)) * (towerIndex === 0 ? 1.25 : 0.82), width: 0.34 + city.scale * 0.24, tone: towerIndex % 3 };
  })), [cities]);
  const towerRef0 = useRef<THREE.InstancedMesh>(null);
  const towerRef1 = useRef<THREE.InstancedMesh>(null);
  const towerRef2 = useRef<THREE.InstancedMesh>(null);
  const towerRefs = useMemo(() => [towerRef0, towerRef1, towerRef2], []);
  const padRef = useRef<THREE.InstancedMesh>(null);
  const towerGroups = useMemo(() => [0, 1, 2].map((tone) => towers.filter((tower) => tower.tone === tone)), [towers]);

  useEffect(() => {
    const matrix = new THREE.Matrix4();
    cities.forEach((city, index) => {
      matrix.compose(new THREE.Vector3(city.x, 0.3, city.z), new THREE.Quaternion(), new THREE.Vector3(city.scale * 1.25, 0.13, city.scale * 1.25));
      padRef.current?.setMatrixAt(index, matrix);
      padRef.current?.setColorAt(index, new THREE.Color(index === selectedIndex ? MAP.red : MAP.cream));
    });
    if (padRef.current) { padRef.current.instanceMatrix.needsUpdate = true; if (padRef.current.instanceColor) padRef.current.instanceColor.needsUpdate = true; }
    towerGroups.forEach((group, tone) => group.forEach((tower, index) => {
      matrix.compose(new THREE.Vector3(tower.x, tower.height / 2 + 0.36, tower.z), new THREE.Quaternion(), new THREE.Vector3(tower.width, tower.height, tower.width));
      const ref = towerRefs[tone];
      ref?.current?.setMatrixAt(index, matrix);
    }));
    towerRefs.forEach((ref) => { if (ref.current) ref.current.instanceMatrix.needsUpdate = true; });
  }, [cities, selectedIndex, towerGroups, towerRefs]);

  const selectPad = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); if (event.instanceId !== undefined) onSelect(event.instanceId); };
  return <>
    <instancedMesh ref={padRef} args={[undefined, undefined, cities.length]} onClick={selectPad} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = "grab"; }} receiveShadow>
      <cylinderGeometry args={[1, 1, 1, 8]} /><meshStandardMaterial vertexColors roughness={0.9} />
    </instancedMesh>
    <instancedMesh ref={towerRef0} args={[undefined, undefined, towerGroups[0]?.length ?? 0]} onClick={(event) => { event.stopPropagation(); const tower = event.instanceId === undefined ? undefined : towerGroups[0]?.[event.instanceId]; if (tower) onSelect(tower.cityIndex); }} castShadow receiveShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={MAP.cream} roughness={0.68} /></instancedMesh>
    <instancedMesh ref={towerRef1} args={[undefined, undefined, towerGroups[1]?.length ?? 0]} onClick={(event) => { event.stopPropagation(); const tower = event.instanceId === undefined ? undefined : towerGroups[1]?.[event.instanceId]; if (tower) onSelect(tower.cityIndex); }} castShadow receiveShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={MAP.red} roughness={0.68} /></instancedMesh>
    <instancedMesh ref={towerRef2} args={[undefined, undefined, towerGroups[2]?.length ?? 0]} onClick={(event) => { event.stopPropagation(); const tower = event.instanceId === undefined ? undefined : towerGroups[2]?.[event.instanceId]; if (tower) onSelect(tower.cityIndex); }} castShadow receiveShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={MAP.cyan} roughness={0.68} /></instancedMesh>
    {cities[selectedIndex] ? <Html position={[cities[selectedIndex].x, 2.4 + cities[selectedIndex].scale, cities[selectedIndex].z]} center distanceFactor={19} style={{ pointerEvents: "none" }}>
      <div className="city-3d-label"><strong>@{cities[selectedIndex].username}</strong><span>{cities[selectedIndex].registered ? "VERIFIED BUILDER CITY" : "SUI DEVELOPER CITY"}</span></div>
    </Html> : null}
  </>;
}

function MapCamera({ command, controls, cities }: { command?: IslandCameraCommand; controls: React.RefObject<OrbitControlsImpl | null>; cities: CityLayout[] }) {
  const { camera } = useThree();
  const goal = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit || !command) return;
    if (command.type === "rotate") {
      const offset = camera.position.clone().sub(orbit.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), command.amount);
      goal.current = { position: orbit.target.clone().add(offset), target: orbit.target.clone() };
    } else if (command.type === "zoom") {
      const direction = camera.position.clone().sub(orbit.target).normalize();
      const distance = THREE.MathUtils.clamp(camera.position.distanceTo(orbit.target) + command.amount, 20, 68);
      goal.current = { position: orbit.target.clone().add(direction.multiplyScalar(distance)), target: orbit.target.clone() };
    } else if (command.type === "focus") {
      const city = cities[command.index];
      if (city) goal.current = { position: new THREE.Vector3(city.x + 7, 10, city.z + 9), target: new THREE.Vector3(city.x, 0.7, city.z) };
    } else goal.current = { position: new THREE.Vector3(0.01, 42, 27), target: new THREE.Vector3(0, 0, 0) };
  }, [camera, cities, command, controls]);
  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit || !goal.current) return;
    const blend = 1 - Math.exp(-5 * Math.min(delta, 0.05));
    camera.position.lerp(goal.current.position, blend); orbit.target.lerp(goal.current.target, blend); orbit.update();
    if (camera.position.distanceTo(goal.current.position) < 0.05) goal.current = null;
  });
  return null;
}

function Scene({ developers, selectedIndex, onSelect, cameraCommand }: { developers: IslandDeveloper[]; selectedIndex: number; onSelect: (index: number) => void; cameraCommand?: IslandCameraCommand }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const cities = useMemo(() => cityLayouts(developers), [developers]);
  return <>
    <color attach="background" args={[MAP.sky]} /><fog attach="fog" args={[MAP.fog, 48, 90]} />
    <Sky distance={450000} sunPosition={[-8, 16, 9]} inclination={0.55} azimuth={0.18} turbidity={7} rayleigh={1.7} />
    <hemisphereLight args={[MAP.sky, MAP.grassDark, 1.3]} />
    <directionalLight position={[-12, 24, 14]} intensity={2.4} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={20} shadow-camera-bottom={-20} />
    <Environment><Lightformer intensity={1.8} position={[0, 12, 4]} scale={[22, 12, 1]} /><Lightformer intensity={0.7} color={MAP.cyan} position={[-12, 4, -5]} rotation-y={Math.PI / 2} scale={[14, 4, 1]} /></Environment>
    <TropicalIsland /><CityInstances cities={cities} selectedIndex={selectedIndex} onSelect={onSelect} />
    <OrbitControls ref={controls} makeDefault target={[0, 0, 0]} minDistance={20} maxDistance={68} minPolarAngle={0.15} maxPolarAngle={1.22} enablePan={false} dampingFactor={0.08} />
    <MapCamera {...(cameraCommand ? { command: cameraCommand } : {})} controls={controls} cities={cities} />
  </>;
}

export default function BuilderIsland3D(props: { developers: IslandDeveloper[]; selectedIndex: number; onSelect: (index: number) => void; cameraCommand?: IslandCameraCommand }) {
  return <Canvas shadows dpr={[1, 1.25]} camera={{ position: [0.01, 42, 27], fov: 40, near: 0.1, far: 150 }} gl={{ antialias: true, alpha: false, powerPreference: "default" }}>
    <Scene {...props} />
  </Canvas>;
}
