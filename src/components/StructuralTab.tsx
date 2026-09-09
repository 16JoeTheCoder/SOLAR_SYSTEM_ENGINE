// src/components/StructuralTab.tsx
import { useState } from 'react';
import type { PanelSpec, ArrayConfig } from '../core/types';
import { sizeStructure } from '../engine/structural';
import type { StructuralInputs, StructuralOutputs } from '../engine/structural';
import { NumField, Slider, Metric } from './inputs';
import { InfoTip } from './InfoTip';

export default function StructuralTab({ panel, array }: {
  panel: PanelSpec; array: ArrayConfig;
}) {
  const [inp, setInp] = useState<StructuralInputs>({
    rowCount: 10, modulesPerRow: 50,
    moduleWidth: panel.width, moduleHeight: panel.height,
    pitch: 6.0, mountHeight: array.height + 1, tilt: array.tilt,
    tracker: false, windSpeed: 40, windExposure: 'C',
    groundSnowKPa: 0.5, soilType: 'cohesionless', soilPhiDeg: 35, soilCKPa: 50,
    steelGrade: 'A500_GrB',
  });
  const [out, setOut] = useState<StructuralOutputs | null>(null);
  const u = (patch: Partial<StructuralInputs>) => setInp(p => ({ ...p, ...patch }));

  // ---- SVG geometry (side elevation) ----
  const groundY = 130;
  const pxPerM = 18;
  const embedPx = out ? Math.min(out.pileEmbedment, 4.5) * pxPerM : 40;
  const mountPx = Math.min(inp.mountHeight, 4) * pxPerM;
  const pileX = 210, pileW = 12;
  const tubeY = groundY - mountPx;
  const modLen = 130, modThk = 7;

  return (
    <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
        🏗️ Structural Sizing — ASCE 7-22 · Broms (1964)
        <InfoTip id="gcr" />
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <NumField label="Row Count" unit="" value={inp.rowCount} min={1} max={10000}
            onChange={(v) => u({ rowCount: Math.round(v) })} />
          <NumField label="Modules / Row" unit="" value={inp.modulesPerRow} min={1} max={500}
            onChange={(v) => u({ modulesPerRow: Math.round(v) })} />
          <NumField label="Row Pitch" unit="m" value={inp.pitch} min={2} max={15} step={0.1}
            onChange={(v) => u({ pitch: v })} />
          <NumField label="Mount Height" unit="m" value={inp.mountHeight} min={0.5} max={4} step={0.1}
            onChange={(v) => u({ mountHeight: v })} />
          <Slider label="Tilt" unit="°" value={inp.tilt} min={0} max={60} step={1}
            onChange={(v) => u({ tilt: v })} />
        </div>
        <div className="space-y-3">
          <Slider label="Wind (3-s gust)" unit="m/s" value={inp.windSpeed} min={15} max={70} step={1}
            onChange={(v) => u({ windSpeed: v })} />
          <NumField label="Ground Snow" unit="kPa" value={inp.groundSnowKPa} min={0} max={5} step={0.1}
            onChange={(v) => u({ groundSnowKPa: v })} />
          <Slider label="Soil φ (sand)" unit="°" value={inp.soilPhiDeg} min={25} max={45} step={1}
            onChange={(v) => u({ soilPhiDeg: v })} />
          <NumField label="Soil c (clay)" unit="kPa" value={inp.soilCKPa} min={10} max={200} step={5}
            onChange={(v) => u({ soilCKPa: v })} />
        </div>
        <div className="space-y-3">
          {([
            ['windExposure', ['B', 'C', 'D'], 'Exposure'],
            ['soilType', ['cohesionless', 'cohesive'], 'Soil Type'],
            ['steelGrade', ['A500_GrB', 'A500_GrC', 'A572_Gr50'], 'Steel Grade'],
          ] as const).map(([key, opts, label]) => (
            <div key={key} className="flex justify-between items-center gap-2">
              <span className="text-xs text-zinc-400">{label}</span>
              <select value={String(inp[key])}
                onChange={(e) => u({ [key]: e.target.value } as Partial<StructuralInputs>)}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-emerald-400">
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={inp.tracker}
              onChange={(e) => u({ tracker: e.target.checked })} className="accent-emerald-500" />
            Single-axis tracker (stow @ 0°)
          </label>
          <button onClick={() => setOut(sizeStructure(inp))}
            className="w-full py-2 px-4 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium transition-colors">
            ⚙️ Size Structure
          </button>
        </div>
      </div>

      {out && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Pile Embedment" value={out.pileEmbedment.toFixed(2)} unit="m" accent="text-orange-400" />
            <Metric label="Pile Count" value={String(out.pileCount)} unit="" />
            <Metric label="Torque Tube" value={`${out.torqueTubeOD}×${out.torqueTubeWall}`} unit="mm" />
            <Metric label="Utilization" value={(out.utilizationRatio * 100).toFixed(0)} unit="%"
              accent={out.utilizationRatio > 0.9 ? 'text-red-400' : 'text-emerald-400'} />
            <Metric label="Bending Stress" value={out.maxBendingStressMPa.toFixed(0)} unit="MPa" />
            <Metric label="Wind Pressure qz" value={out.governingWindPressurePa.toFixed(0)} unit="Pa" />
            <Metric label="Steel Intensity" value={out.structuralSteelKgPerMWdc.toFixed(0)} unit="kg/MWdc" />
            <Metric label="Structural Cost" value={out.structuralCostPerWdc.toFixed(3)} unit="$/Wdc" accent="text-amber-400" />
          </div>

          {/* Engineering cross-section */}
          <svg viewBox="0 0 420 240" className="w-full max-w-lg mx-auto bg-zinc-900/50 rounded-lg border border-zinc-800">
            {/* wind arrow */}
            <line x1="30" y1={tubeY - 30} x2="120" y2={tubeY - 30} stroke="#f59e0b" strokeWidth="2" markerEnd="url(#arr)" />
            <text x="34" y={tubeY - 38} fill="#f59e0b" fontSize="10" fontFamily="monospace">
              wind qz = {out.governingWindPressurePa.toFixed(0)} Pa
            </text>
            <defs>
              <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" />
              </marker>
            </defs>
            {/* module */}
            <g transform={`rotate(${-inp.tilt} ${pileX} ${tubeY})`}>
              <rect x={pileX - modLen / 2} y={tubeY - modThk / 2} width={modLen} height={modThk}
                rx="2" fill="#38bdf8" stroke="#0ea5e9" strokeWidth="1" />
              {/* cell lines */}
              {[0.25, 0.5, 0.75].map(f => (
                <line key={f} x1={pileX - modLen / 2 + modLen * f} y1={tubeY - modThk / 2}
                  x2={pileX - modLen / 2 + modLen * f} y2={tubeY + modThk / 2} stroke="#0ea5e9" strokeWidth="0.7" />
              ))}
            </g>
            {/* torque tube */}
            <circle cx={pileX} cy={tubeY} r="6" fill="#a1a1aa" stroke="#71717a" strokeWidth="1.5" />
            {/* pile */}
            <rect x={pileX - pileW / 2} y={tubeY} width={pileW} height={mountPx + embedPx}
              fill="#78716c" stroke="#57534e" strokeWidth="1" />
            {/* ground line + hatching */}
            <line x1="20" y1={groundY} x2="400" y2={groundY} stroke="#a1a1aa" strokeWidth="2" />
            {Array.from({ length: 18 }, (_, i) => (
              <line key={i} x1={26 + i * 21} y1={groundY} x2={20 + i * 21} y2={groundY + 7}
                stroke="#52525b" strokeWidth="1" />
            ))}
            {/* dimension: mount height */}
            <line x1={pileX - 40} y1={tubeY} x2={pileX - 40} y2={groundY} stroke="#34d399" strokeWidth="1" strokeDasharray="3 2" />
            <line x1={pileX - 45} y1={tubeY} x2={pileX - 35} y2={tubeY} stroke="#34d399" strokeWidth="1" />
            <line x1={pileX - 45} y1={groundY} x2={pileX - 35} y2={groundY} stroke="#34d399" strokeWidth="1" />
            <text x={pileX - 90} y={(tubeY + groundY) / 2} fill="#34d399" fontSize="9" fontFamily="monospace">
              h={inp.mountHeight.toFixed(1)}m
            </text>
            {/* dimension: embedment */}
            <line x1={pileX + 40} y1={groundY} x2={pileX + 40} y2={groundY + embedPx} stroke="#fb923c" strokeWidth="1" strokeDasharray="3 2" />
            <line x1={pileX + 35} y1={groundY} x2={pileX + 45} y2={groundY} stroke="#fb923c" strokeWidth="1" />
            <line x1={pileX + 35} y1={groundY + embedPx} x2={pileX + 45} y2={groundY + embedPx} stroke="#fb923c" strokeWidth="1" />
            <text x={pileX + 48} y={groundY + embedPx / 2} fill="#fb923c" fontSize="9" fontFamily="monospace">
              L={out.pileEmbedment.toFixed(2)}m
            </text>
            {/* labels */}
            <text x={pileX + modLen / 2 + 8} y={tubeY - 14} fill="#38bdf8" fontSize="9" fontFamily="monospace">
              module @ {inp.tilt}°
            </text>
            <text x={pileX + 12} y={tubeY + 4} fill="#a1a1aa" fontSize="9" fontFamily="monospace">
              tube Ø{out.torqueTubeOD}×{out.torqueTubeWall}
            </text>
            <text x={pileX - 60} y={groundY + embedPx + 16} fill="#78716c" fontSize="9" fontFamily="monospace">
              pile Ø{(out.pileDiameter * 1000).toFixed(0)}mm
            </text>
          </svg>

          <p className="text-[10px] text-zinc-500">
            ASCE 7-22 §29 wind · §7 snow · Broms (1964) short piles · simply-supported tube.
            Assumes: no seismic, no scour, no corrosion allowance. Side elevation, not to scale.
          </p>
        </>
      )}
    </section>
  );
}