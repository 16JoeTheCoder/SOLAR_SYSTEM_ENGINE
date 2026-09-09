// src/components/Array3D.tsx
// Single-module 3D inspector — R3F, fixed camera, no orbit, 3 toggleable layers.
import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { PanelSpec, ArrayConfig, Location } from '../core/types';
import { computeSunPosition, getTimezoneOffset } from '../core/api/openMeteo';

// ── Constants ────────────────────────────────────────────────────────────────
const COLS = 6;            // 6 × 10 = 60 half-cells (portrait module topology)
const ROWS = 10;
const CELL_COUNT = COLS * ROWS;
const VMP = 41.4;          // V — 144 half-cell topology
const VOC = 49.9;          // V
const PAD = 0.03;          // frame padding (m)
const GAP = 0.004;         // inter-cell gap (m)

const D2R = THREE.MathUtils.degToRad;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Deterministic per-cell jitter (0.82 – 1.00) so the grid isn't uniform
function jitter(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return 0.82 + (s - Math.floor(s)) * 0.18;
}

function cellPos(i: number, w: number, h: number): [number, number, number] {
  const cw = (w - PAD * 2 - GAP * (COLS - 1)) / COLS;
  const ch = (h - PAD * 2 - GAP * (ROWS - 1)) / ROWS;
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  return [
    -w / 2 + PAD + cw / 2 + c * (cw + GAP),
    -h / 2 + PAD + ch / 2 + r * (ch + GAP),
    0.024,
  ];
}

// ── Fading material helper (corporate 150–250 ms ease, via lerp) ────────────
function useFadingMaterial<T extends THREE.Material>(create: () => T, target: number): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mat = useMemo(create, []);
  useFrame(() => {
    mat.opacity += (target - mat.opacity) * 0.16;
    mat.visible = mat.opacity > 0.02;
  });
  return mat;
}

// ── Camera auto-fit (Problem 3) — fixed angle, frames module bounding box ───
function CameraRig({ w, h }: { w: number; h: number }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const d = Math.max(w, h) * 1.9;
    camera.position.set(d * 0.75, d * 0.55, d * 0.95);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [w, h, camera]);
  return null;
}

// ── Sun light + disc, driven by your NOAA solver ─────────────────────────────
function SunRig({ elevation, azimuth }: { elevation: number; azimuth: number }) {
  const night = elevation < 0;
  const pos = useMemo(() => {
    const el = D2R(Math.max(2, elevation));
    const az = D2R(azimuth);
    return new THREE.Vector3(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      -Math.cos(az) * Math.cos(el)
    ).multiplyScalar(4);
  }, [elevation, azimuth]);

  return (
    <>
      <ambientLight intensity={night ? 0.25 : 0.55} />
      <directionalLight
        position={pos}
        intensity={night ? 0.1 : 0.6 + clamp01(Math.sin(D2R(elevation))) * 1.1}
        color={elevation < 15 && !night ? '#ffd9a0' : '#ffffff'}
      />
      {!night && (
        <mesh position={pos.clone().multiplyScalar(0.85)}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshBasicMaterial color="#fde047" />
        </mesh>
      )}
    </>
  );
}

// ── Cell grid: ONE InstancedMesh, hover via instanceId ───────────────────────
function CellGrid({ w, h, sunScore, night, onHover }: {
  w: number; h: number; sunScore: number; night: boolean;
  onHover: (i: number | null) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < CELL_COUNT; i++) {
      const [x, y, z] = cellPos(i, w, h);
      m.makeTranslation(x, y, z);
      ref.current.setMatrixAt(i, m);
      const eff = jitter(i) * sunScore;
      if (night) color.set('#1e293b');
      else if (eff > 0.72) color.set('#16a34a');
      else if (eff > 0.45) color.set('#ca8a04');
      else color.set('#dc2626');
      ref.current.setColorAt(i, color);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [w, h, sunScore, night]);

  const cw = (w - PAD * 2 - GAP * (COLS - 1)) / COLS;
  const ch = (h - PAD * 2 - GAP * (ROWS - 1)) / ROWS;

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, CELL_COUNT]}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(e.instanceId ?? null);
      }}
      onPointerOut={() => onHover(null)}
    >
      <boxGeometry args={[cw, ch, 0.004]} />
      <meshStandardMaterial roughness={0.35} metalness={0.15} />
    </instancedMesh>
  );
}

// ── Hover ring (the "circle" metaphor) ───────────────────────────────────────
function HoverRing({ index, w, h }: { index: number; w: number; h: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const cw = (w - PAD * 2 - GAP * (COLS - 1)) / COLS;
  const ch = (h - PAD * 2 - GAP * (ROWS - 1)) / ROWS;
  const r = Math.min(cw, ch) * 0.85;

  useFrame(() => {
    const s = ref.current.scale.x + (1 - ref.current.scale.x) * 0.25; // ease-out pop
    ref.current.scale.setScalar(s);
    mat.current.opacity += (0.95 - mat.current.opacity) * 0.25;
  });

  const [x, y] = cellPos(index, w, h);
  return (
    <mesh ref={ref} position={[x, y, 0.03]} scale={0.6}>
      <ringGeometry args={[r * 0.62, r * 0.75, 32]} />
      <meshBasicMaterial ref={mat} color="#ffffff" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// ── Layer 2: AR glass + moving glare stripe ──────────────────────────────────
function GlassLayer({ w, h, on, glare, azimuth }: {
  w: number; h: number; on: boolean; glare: number; azimuth: number;
}) {
  const glassMat = useFadingMaterial(
    () => new THREE.MeshStandardMaterial({ color: '#9db8d2', transparent: true, opacity: 0, roughness: 0.12, metalness: 0.5 }),
    on ? 0.16 + glare * 0.2 : 0
  );
  const stripeMat = useFadingMaterial(
    () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
    on ? glare * 0.5 : 0
  );
  const stripeX = Math.sin(D2R(azimuth - 180)) * w * 0.28;

  return (
    <>
      <mesh position={[0, 0, 0.032]} material={glassMat}>
        <boxGeometry args={[w, h, 0.002]} />
      </mesh>
      <mesh position={[stripeX, 0, 0.034]} rotation={[0, 0, 0.35]} material={stripeMat}>
        <planeGeometry args={[w * 0.16, h * 0.95]} />
      </mesh>
    </>
  );
}

// ── Layer 3: thermal heat-map (CanvasTexture, blue→red) ─────────────────────
function makeHeatTexture(cellTemp: number): THREE.CanvasTexture {
  const W = 64, H = 96;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const heat = clamp01((cellTemp - 20) / 50); // 20 °C → cold, 70 °C → max
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - W / 2) / W, (y - H * 0.35) / H) * 1.4;
      const t = clamp01(heat - d * 0.55);
      const i = (y * W + x) * 4;
      img.data[i] = 59 + (239 - 59) * t;        // R: blue→red
      img.data[i + 1] = 130 - 62 * t;           // G
      img.data[i + 2] = 246 - 178 * t;          // B
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function HeatLayer({ w, h, on, cellTemp }: { w: number; h: number; on: boolean; cellTemp: number }) {
  const tex = useMemo(() => makeHeatTexture(cellTemp), [cellTemp]);
  const mat = useFadingMaterial(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    on ? 0.45 : 0
  );
  mat.map = tex;
  mat.needsUpdate = true;
  return (
    <mesh position={[0, 0, 0.028]} material={mat}>
      <planeGeometry args={[w - PAD, h - PAD]} />
    </mesh>
  );
}

// ── Layer 1 extras: busbars + dimension wireframe (Engineering overlay) ──────
function EngineeringOverlay({ w, h, on }: { w: number; h: number; on: boolean }) {
  const busMat = useFadingMaterial(
    () => new THREE.MeshStandardMaterial({ color: '#d4d9e0', metalness: 0.85, roughness: 0.3, transparent: true, opacity: 0 }),
    on ? 0.95 : 0
  );
  const edgeMat = useFadingMaterial(
    () => new THREE.LineBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0 }),
    on ? 0.9 : 0
  );
  const edgeGeo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 1.02, h * 1.02, 0.07)),
    [w, h]
  );
  const cellAreaH = h - PAD * 2;

  return (
    <>
      {[-w / 4, 0, w / 4].map((x) => (
        <mesh key={x} position={[x, 0, 0.027]} material={busMat}>
          <boxGeometry args={[0.006, cellAreaH, 0.002]} />
        </mesh>
      ))}
      <lineSegments geometry={edgeGeo} material={edgeMat} />
    </>
  );
}

// ── Ground + fake soft shadow ────────────────────────────────────────────────
function Ground({ size, elevation, azimuth, night }: {
  size: number; elevation: number; azimuth: number; night: boolean;
}) {
  const stretch = night ? 1 : 1 + (1 - clamp01(Math.sin(D2R(Math.max(0, elevation))))) * 1.6;
  return (
    <group position={[0, -size * 0.72, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[size * 1.7, 48]} />
        <meshStandardMaterial color="#27272a" roughness={1} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, D2R(azimuth - 180)]}
        scale={[stretch, 1, 1]}
        position={[0, 0.005, 0]}
      >
        <circleGeometry args={[size * 0.62, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={night ? 0.15 : 0.35} />
      </mesh>
    </group>
  );
}

// ── Side-panel helpers ───────────────────────────────────────────────────────
function SpecRow({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="flex justify-between text-xs py-1 border-b border-zinc-800 last:border-0">
      <span className="text-zinc-500">{k}</span>
      <span className={`font-mono ${accent ?? 'text-zinc-200'}`}>{v}</span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
interface Array3DProps {
  panel: PanelSpec;
  array: ArrayConfig;
  location: Location;
  timestamp: number;
  timezone: string;
  result: { acPower: number; performanceRatio: number; cellTemp: number; aoI: number; poaEffective: number };
}

export default function Array3D({ panel, array, location, timestamp, timezone, result }: Array3DProps) {
  const [overlays, setOverlays] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sun position — reuses your NOAA solver
  const sun = useMemo(
    () => computeSunPosition(timestamp, location.latitude, location.longitude, getTimezoneOffset(timezone)),
    [timestamp, location.latitude, location.longitude, timezone]
  );
  const elevation = 90 - sun.zenith;
  const night = elevation < 0;

  // Optical score: how well the module faces the sun right now
  const sunScore = night
    ? 0
    : clamp01(Math.cos(D2R(Math.min(90, result.aoI)))) * clamp01(Math.sin(D2R(Math.max(0, elevation))));
  const glare = clamp01(Math.sin(D2R(Math.max(0, elevation)))) * clamp01(Math.cos(D2R(result.aoI - 20)));

  const w = panel.width;
  const h = panel.height;
  const tiltRad = D2R(array.tilt - 90);       // tilt 90° = upright facing camera
  const azRad = D2R(180 - array.azimuth);

  // Side-panel derived specs
  const imp = panel.pmax / VMP;
  const isc = imp * 1.05;
  const weight = w * h * 10.8;                // kg — glass-glass module ≈ 10.8 kg/m²
  const fleetKwp = (panel.pmax * array.moduleCount) / 1000;
  const dailyMwh = (result.acPower / 1000) * 4.2 / 1000;
  const pr = result.performanceRatio;
  const prColor = pr >= 80 ? 'bg-emerald-500' : pr >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const prText = pr >= 80 ? 'text-emerald-400' : pr >= 60 ? 'text-amber-400' : 'text-red-400';

  // Hovered-cell telemetry
  const cellInfo = hovered !== null ? (() => {
    const r = Math.floor(hovered / COLS) + 1;
    const c = (hovered % COLS) + 1;
    const j = jitter(hovered);
    const cur = imp * j * sunScore;
    const volt = (VMP / CELL_COUNT) * j;
    const shade = (1 - j) * 100 + (1 - sunScore) * 8;
    const status = j * sunScore > 0.72 ? 'Optimal' : j * sunScore > 0.45 ? 'Sub-optimal' : 'Hot-spot risk';
    const statusClr = j * sunScore > 0.72 ? 'text-emerald-400' : j * sunScore > 0.45 ? 'text-amber-400' : 'text-red-400';
    return { r, c, cur, volt, shade, status, statusClr };
  })() : null;

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4">
      {/* ── 3D viewport ─────────────────────────────────────────────── */}
      <div
        ref={wrapRef}
        className="relative flex-1 h-[440px] rounded-lg overflow-hidden bg-zinc-950/60 cursor-crosshair"
        onMouseMove={(e) => {
          const r = wrapRef.current?.getBoundingClientRect();
          if (r) setMouse({ x: e.clientX - r.left, y: e.clientY - r.top });
        }}
      >
        <Canvas dpr={[1, 1.75]} camera={{ fov: 35, near: 0.1, far: 100 }} onPointerMissed={() => setHovered(null)}>
          <CameraRig w={w} h={h} />
          <SunRig elevation={elevation} azimuth={sun.azimuth} />

          <group rotation={[0, azRad, 0]}>
            <group rotation={[tiltRad, 0, 0]}>
              {/* Frame */}
              <mesh>
                <boxGeometry args={[w, h, 0.045]} />
                <meshStandardMaterial color="#3f3f46" roughness={0.6} metalness={0.4} />
              </mesh>
              <CellGrid w={w} h={h} sunScore={sunScore} night={night} onHover={setHovered} />
              {hovered !== null && <HoverRing index={hovered} w={w} h={h} />}
              <HeatLayer w={w} h={h} on={overlays} cellTemp={result.cellTemp} />
              <GlassLayer w={w} h={h} on={overlays} glare={glare} azimuth={sun.azimuth} />
              <EngineeringOverlay w={w} h={h} on={overlays} />
            </group>
          </group>

          <Ground size={Math.max(w, h)} elevation={elevation} azimuth={sun.azimuth} night={night} />
        </Canvas>

        {/* HUD — top left: sun readout */}
        <div className="absolute top-3 left-3 bg-zinc-900/80 backdrop-blur rounded-lg px-3 py-1.5 text-[10px] font-mono text-zinc-300 pointer-events-none">
          {night ? '🌙 Night — module idle' : `☀️ ${elevation.toFixed(1)}° elev · ${sun.azimuth.toFixed(0)}° az`}
        </div>
        {/* HUD — top right: geometry */}
        <div className="absolute top-3 right-3 bg-zinc-900/80 backdrop-blur rounded-lg px-3 py-1.5 text-[10px] font-mono text-emerald-400 pointer-events-none">
          {panel.technology} · tilt {array.tilt}° · az {array.azimuth}°
        </div>

        {/* Layer legend (only when overlays on) */}
        <div
          className={`absolute bottom-3 left-3 bg-zinc-900/80 backdrop-blur rounded-lg px-3 py-1.5 text-[10px] font-mono text-zinc-400 space-y-0.5 pointer-events-none transition-opacity duration-200 ${overlays ? 'opacity-100' : 'opacity-0'}`}
        >
          <div><span className="text-zinc-200">▬</span> Busbars (3×)</div>
          <div><span className="text-sky-300">▬</span> AR glass · glare {Math.round(glare * 100)}%</div>
          <div><span className="text-red-400">▬</span> Thermal map · {result.cellTemp.toFixed(0)}°C</div>
          <div><span className="text-amber-400">▬</span> Dimension wireframe</div>
        </div>

        {/* Engineering toggle — REAL working button with visual feedback */}
        <button
          onClick={() => setOverlays((o) => !o)}
          className={`absolute bottom-3 right-3 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors duration-200 ${
            overlays
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          {overlays ? '✕ Engineering: ON' : '🔧 Engineering'}
        </button>

        {/* Hover tooltip — corporate minimalist */}
        {cellInfo && (
          <div
            className="absolute z-10 w-52 bg-zinc-900/95 border border-zinc-700 rounded-lg p-2.5 shadow-xl pointer-events-none transition-opacity duration-100"
            style={{
              left: Math.min(mouse.x + 16, (wrapRef.current?.clientWidth ?? 400) - 220),
              top: Math.max(mouse.y - 10, 8),
            }}
          >
            <div className="text-[11px] font-semibold text-white mb-1">
              Cell R{cellInfo.r}·C{cellInfo.c} <span className={`ml-1 text-[10px] ${cellInfo.statusClr}`}>● {cellInfo.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-mono text-zinc-400">
              <span>Current</span><span className="text-right text-zinc-200">{cellInfo.cur.toFixed(2)} A</span>
              <span>Voltage</span><span className="text-right text-zinc-200">{cellInfo.volt.toFixed(3)} V</span>
              <span>Shading loss</span><span className="text-right text-zinc-200">+{cellInfo.shade.toFixed(1)}%</span>
              <span>Cell temp</span><span className="text-right text-zinc-200">{result.cellTemp.toFixed(1)} °C</span>
            </div>
            {cellInfo.status === 'Hot-spot risk' && (
              <div className="mt-1.5 text-[9px] text-amber-400/90 border-t border-zinc-800 pt-1">
                ⚠ Recommend bypass-diode check for this string
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Car-stats side panel ────────────────────────────────────── */}
      <aside className="lg:w-72 shrink-0 bg-zinc-900/60 border border-zinc-700/50 rounded-lg p-4 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Module Under Inspection</div>
          <div className="text-sm font-semibold text-white">{panel.technology} · {panel.pmax} W</div>
        </div>

        <div>
          <SpecRow k="Cell matrix" v={`${COLS}×${ROWS} half-cells`} />
          <SpecRow k="Efficiency (STC)" v={`${(panel.efficiencyStc * 100).toFixed(1)} %`} accent="text-emerald-400" />
          <SpecRow k="Dimensions" v={`${w.toFixed(3)} × ${h.toFixed(3)} m`} />
          <SpecRow k="Weight" v={`${weight.toFixed(1)} kg`} />
          <SpecRow k="Vmp / Imp" v={`${VMP.toFixed(1)} V / ${imp.toFixed(2)} A`} />
          <SpecRow k="Voc / Isc" v={`${VOC.toFixed(1)} V / ${isc.toFixed(2)} A`} />
          <SpecRow k="Bifaciality φ" v={panel.bifaciality.toFixed(2)} />
          <SpecRow k="Temp coeff γ" v={`${panel.tempCoeffPmax.toFixed(2)} %/°C`} />
        </div>

        {/* PR benchmark bar */}
        <div>
          <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
            <span>Performance ratio</span>
            <span className={`font-mono ${prText}`}>{pr.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${prColor}`} style={{ width: `${Math.min(100, pr)}%` }} />
          </div>
          <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5">
            <span>0</span><span className="text-amber-500/70">60</span><span className="text-emerald-500/70">80+</span><span>100</span>
          </div>
        </div>

        {/* Fleet output — moduleCount slider drives ONLY this data */}
        <div className="border-t border-zinc-800 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Fleet Output (N = {array.moduleCount.toLocaleString()})</div>
          <SpecRow k="Fleet DC nameplate" v={`${fleetKwp.toFixed(1)} kWp`} />
          <SpecRow k="Live AC output" v={`${(result.acPower / 1000).toFixed(2)} kW`} accent="text-emerald-400" />
          <SpecRow k="Est. daily energy" v={dailyMwh >= 1 ? `${dailyMwh.toFixed(2)} MWh` : `${(dailyMwh * 1000).toFixed(0)} kWh`} />
        </div>
      </aside>
    </div>
  );
}