"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* Theme colors resolved from CSS tokens (client-only module, loaded with
   ssr:false). Resolved once at load — the visual sits on a brand-dark
   surface and doesn't re-theme on light/dark toggle. */
const themeColor = (token: string, fallback: string) =>
  typeof window === "undefined"
    ? fallback
    : getComputedStyle(document.documentElement)
        .getPropertyValue(token)
        .trim() || fallback;

const COLORS = {
  primary: themeColor("--primary", "#007a5e"),
  info: themeColor("--info", "#4ab3e6"),
};

/** Logo on a plane just in front of the sphere (the nucleus).
 *  Uses alphaTest so transparent pixels are discarded.
 *  Opaque logo pixels write to depth so orbiting icons pass in front. */
function LogoMark() {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      setTexture(tex);
    };
    img.src = "/logo.svg";
  }, []);

  if (!texture) return null;

  return (
    <mesh position={[0, 0, 1.06]}>
      <planeGeometry args={[1.1, 1.1]} />
      <meshBasicMaterial map={texture} alphaTest={0.1} transparent={false} />
    </mesh>
  );
}

/** Background star field */
function StarField({ count = 300 }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 25;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 25;
      positions[i * 3 + 2] = -5 - Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  const texture = useMemo(() => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.3, "rgba(255,255,255,0.6)");
    gradient.addColorStop(0.7, "rgba(255,255,255,0.15)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }, []);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        map={texture}
        color="#ffffff"
        size={0.06}
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/** Spinning nucleus — opaque fresnel sphere with rotating wireframe triangle pattern */
function Nucleus() {
  const groupRef = useRef<THREE.Group>(null);

  const fresnelMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uBaseColor: { value: new THREE.Color("#ffffff") },
          uRimColor: { value: new THREE.Color(COLORS.primary) },
          uRimPower: { value: 1.8 },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vViewDir;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            vViewDir = normalize(-mvPos.xyz);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          uniform vec3 uBaseColor;
          uniform vec3 uRimColor;
          uniform float uRimPower;
          varying vec3 vNormal;
          varying vec3 vViewDir;
          void main() {
            float fresnel = 1.0 - max(dot(vNormal, vViewDir), 0.0);
            fresnel = pow(fresnel, uRimPower);
            vec3 color = mix(uBaseColor, uRimColor, fresnel);
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    []
  );

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.15;
  });

  return (
    <group ref={groupRef}>
      {/* Solid sphere */}
      <mesh material={fresnelMaterial}>
        <sphereGeometry args={[1.0, 64, 64]} />
      </mesh>
      {/* Geodesic triangle grid — detail=3 for visible triangles */}
      <mesh>
        <icosahedronGeometry args={[1.05, 3]} />
        <meshBasicMaterial
          wireframe
          color={COLORS.primary}
          transparent
          opacity={0.18}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Orbiting icon system                                               */
/* ------------------------------------------------------------------ */

/** SVG path data for the four product-pillar icons (Lucide-style 24x24) */
const ICON_DEFS = [
  {
    name: "documents",
    svg: `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>`,
    color: COLORS.info,
    speed: 0.30,
    startAngle: 0,
  },
  {
    name: "shield",
    svg: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>`,
    color: COLORS.primary,
    speed: 0.25,
    startAngle: Math.PI * 0.5,
  },
  {
    name: "training",
    svg: `<path d="M22 10v6"/><path d="M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 6 3 6 3s3 0 6-3v-5"/>`,
    color: COLORS.info,
    speed: 0.20,
    startAngle: Math.PI,
  },
  {
    name: "attachments",
    svg: `<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>`,
    color: COLORS.primary,
    speed: 0.35,
    startAngle: Math.PI * 1.5,
  },
];

/** Orbit configurations — ellipses in the XY plane (camera-facing).
 *  Z rotation directly controls visible tilt angle.
 *  X rotation (0.3) adds subtle 3D perspective.
 *  zDepth adds Z oscillation so icons pass in front of & behind the sphere. */
const ORBIT_CONFIGS = [
  // X pair — elongated, forming an X
  { tilt: [0.3, 0, -Math.PI / 4]  as [number, number, number], semiMajor: 2.3, semiMinor: 0.9, zDepth: 1.1 },
  { tilt: [0.3, 0,  Math.PI / 4]  as [number, number, number], semiMajor: 2.3, semiMinor: 0.9, zDepth: 1.1 },
  // + pair — rounder, forming a +
  { tilt: [0.3, 0,  0]            as [number, number, number], semiMajor: 2.0, semiMinor: 1.3, zDepth: 1.1 },
  { tilt: [0.3, 0,  Math.PI / 2]  as [number, number, number], semiMajor: 2.0, semiMinor: 0.9, zDepth: 1.1 },
];

/** Render an SVG icon string to a crisp CanvasTexture with subtle glow */
function createIconTexture(svgContent: string, color: string): Promise<THREE.CanvasTexture> {
  return new Promise((resolve) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg>`;

    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const img = new Image();
    img.onload = () => {
      const pad = 40;
      const drawSize = size - pad * 2;

      // Subtle glow behind for readability against dark bg
      ctx.filter = "blur(4px)";
      ctx.globalAlpha = 0.5;
      ctx.drawImage(img, pad, pad, drawSize, drawSize);
      ctx.globalAlpha = 1.0;

      // Sharp icon on top
      ctx.filter = "none";
      ctx.drawImage(img, pad, pad, drawSize, drawSize);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Load all icon textures once */
function useIconTextures() {
  const [textures, setTextures] = useState<THREE.CanvasTexture[]>([]);

  useEffect(() => {
    Promise.all(
      ICON_DEFS.map((def) => createIconTexture(def.svg, def.color))
    ).then(setTextures);
  }, []);

  return textures;
}

/** Reusable temp vector to avoid GC in render loop */
const _tempVec = new THREE.Vector3();

/** A single orbiting icon sprite that billboards toward the camera */
function OrbitingIcon({
  texture,
  speed,
  startAngle,
  semiMajor,
  semiMinor,
  zDepth,
}: {
  texture: THREE.CanvasTexture;
  speed: number;
  startAngle: number;
  semiMajor: number;
  semiMinor: number;
  zDepth: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const angle = useRef(startAngle);

  useFrame(({ camera }, delta) => {
    if (!meshRef.current) return;

    // 3D elliptical orbit — XY for visible shape, Z to wrap around the sphere
    angle.current += delta * speed;
    const x = Math.cos(angle.current) * semiMajor;
    const y = Math.sin(angle.current) * semiMinor;
    const z = Math.sin(angle.current) * zDepth;
    meshRef.current.position.set(x, y, z);

    // Billboard: face camera accounting for parent transforms
    meshRef.current.getWorldPosition(_tempVec);
    meshRef.current.lookAt(camera.position);
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[0.45, 0.45]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Visible 3D orbit ring — elliptical in XY with Z oscillation to wrap around sphere */
function OrbitPath({ semiMajor, semiMinor, zDepth }: { semiMajor: number; semiMinor: number; zDepth: number }) {
  const geometry = useMemo(() => {
    const segments = 128;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(t) * semiMajor,
        Math.sin(t) * semiMinor,
        Math.sin(t) * zDepth,
      ));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [semiMajor, semiMinor, zDepth]);

  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial
        color={COLORS.info}
        transparent
        opacity={0.25}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineLoop>
  );
}

/** One tilted orbit containing a path ring and an icon electron */
function ElectronOrbit({
  tilt,
  texture,
  speed,
  startAngle,
  semiMajor,
  semiMinor,
  zDepth,
}: {
  tilt: [number, number, number];
  texture: THREE.CanvasTexture;
  speed: number;
  startAngle: number;
  semiMajor: number;
  semiMinor: number;
  zDepth: number;
}) {
  return (
    <group rotation={tilt}>
      <OrbitPath semiMajor={semiMajor} semiMinor={semiMinor} zDepth={zDepth} />
      <OrbitingIcon texture={texture} speed={speed} startAngle={startAngle} semiMajor={semiMajor} semiMinor={semiMinor} zDepth={zDepth} />
    </group>
  );
}

/** The full atom: 4 electron orbits fixed in place, icons orbit along them */
function AtomSystem() {
  const textures = useIconTextures();
  if (textures.length === 0) return null;

  return (
    <group>
      {ICON_DEFS.map((def, i) => (
        <ElectronOrbit
          key={def.name}
          tilt={ORBIT_CONFIGS[i].tilt}
          texture={textures[i]}
          speed={def.speed}
          startAngle={def.startAngle}
          semiMajor={ORBIT_CONFIGS[i].semiMajor}
          semiMinor={ORBIT_CONFIGS[i].semiMinor}
          zDepth={ORBIT_CONFIGS[i].zDepth}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene & export                                                     */
/* ------------------------------------------------------------------ */

function Scene() {
  return (
    <>
      <StarField count={250} />
      <Nucleus />
      <LogoMark />
      <AtomSystem />
      <ambientLight intensity={0.05} />
    </>
  );
}

export default function HeroVisual() {
  return (
    <div
      className="h-[400px] w-full lg:h-[500px]"
      style={{
        maskImage:
          "radial-gradient(ellipse 70% 70% at center, black 50%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 70% 70% at center, black 50%, transparent 100%)",
      }}
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 7], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
