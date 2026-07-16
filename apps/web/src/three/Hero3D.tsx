/**
 * Hero3D — the landing's animated three-dimensional opener.
 *
 * Visual idea: a slowly rotating crystalline lattice of "lab nodes"
 * orbiting a central illuminated sample, like a constellation of
 * instruments looking inward. Particles drift around them in volumetric
 * mist. The whole scene is camera-driven by mouse parallax so it feels
 * present without being noisy.
 *
 * Everything here is presentational. State and data live elsewhere.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Environment,
  Float,
  OrbitControls,
  PerspectiveCamera,
  Points,
  PointMaterial,
} from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const ACCENT = new THREE.Color("#38bda7");
const ACCENT_FAINT = new THREE.Color("#0e3a33");

interface NodeSpec {
  position: [number, number, number];
  scale: number;
}

function nodes(count: number, radius: number): NodeSpec[] {
  const out: NodeSpec[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const phi = Math.acos(2 * t - 1);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    out.push({ position: [x, y, z], scale: 0.18 + Math.random() * 0.18 });
  }
  return out;
}

function NodeLattice() {
  const group = useRef<THREE.Group>(null);
  const positions = useMemo(() => nodes(34, 2.6), []);

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.06;
    group.current.rotation.x =
      Math.sin(state.clock.elapsedTime * 0.2) * 0.08;
  });

  return (
    <group ref={group}>
      {positions.map((node, i) => (
        <Float
          key={i}
          speed={0.6 + (i % 5) * 0.2}
          rotationIntensity={0.4}
          floatIntensity={0.6}
        >
          <mesh position={node.position} scale={node.scale}>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial
              color={i % 3 === 0 ? ACCENT : ACCENT_FAINT}
              emissive={i % 3 === 0 ? ACCENT : new THREE.Color("#0a0e10")}
              emissiveIntensity={i % 3 === 0 ? 1.2 : 0.2}
              metalness={0.6}
              roughness={0.2}
            />
          </mesh>
        </Float>
      ))}

      {/* Connecting lines between near-neighbours, hand-tuned for legibility. */}
      <NodeEdges nodes={positions} />
    </group>
  );
}

function NodeEdges({ nodes }: { nodes: NodeSpec[] }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const max = 1.4; // only connect points within this distance
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!.position;
        const b = nodes[j]!.position;
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        const dz = a[2] - b[2];
        if (dx * dx + dy * dy + dz * dz < max * max) {
          positions.push(...a, ...b);
        }
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    return geom;
  }, [nodes]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#1d3a35" transparent opacity={0.55} />
    </lineSegments>
  );
}

function CoreSample() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.4;
    ref.current.rotation.x += delta * 0.18;
    const s = 1 + Math.sin(state.clock.elapsedTime * 1.2) * 0.04;
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[0.7, 2]} />
      <meshPhysicalMaterial
        color="#ecfdf5"
        emissive={ACCENT}
        emissiveIntensity={1.6}
        roughness={0.15}
        metalness={0.4}
        clearcoat={1}
        clearcoatRoughness={0.05}
      />
    </mesh>
  );
}

function MistParticles() {
  const positions = useMemo(() => {
    const arr = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const r = 4 + Math.random() * 4;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(p) * Math.cos(t);
      arr[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
      arr[i * 3 + 2] = r * Math.cos(p);
    }
    return arr;
  }, []);
  const ref = useRef<THREE.Points>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.02;
  });
  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled>
      <PointMaterial
        transparent
        depthWrite={false}
        size={0.012}
        sizeAttenuation
        color="#9bb1aa"
      />
    </Points>
  );
}

function ParallaxRig() {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    const { x, y } = state.pointer;
    const target = new THREE.Vector3(x * 0.6, y * 0.4, 0);
    group.current.position.lerp(target, 0.05);
  });
  return (
    <group ref={group}>
      <NodeLattice />
      <CoreSample />
    </group>
  );
}

export function Hero3D() {
  return (
    <Canvas
      dpr={[1, 1.8]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <color attach="background" args={["#050708"]} />
      <PerspectiveCamera makeDefault fov={45} position={[0, 0, 6]} />
      <ambientLight intensity={0.4} />
      <pointLight position={[6, 6, 6]} intensity={32} color={ACCENT} />
      <pointLight position={[-6, -2, 4]} intensity={18} color="#a7f3d0" />
      <ParallaxRig />
      <MistParticles />
      <Environment preset="city" environmentIntensity={0.25} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableRotate={false}
      />
    </Canvas>
  );
}
