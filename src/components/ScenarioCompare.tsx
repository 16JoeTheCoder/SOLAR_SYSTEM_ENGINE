// src/components/ScenarioCompare.tsx
import { useState } from 'react';
import type { PanelSpec, ArrayConfig, SimulationResult, AnnualProjection, FinancialResult } from '../core/types';

export interface Snapshot {
  name: string;
  panel: PanelSpec;
  array: ArrayConfig;
  result: SimulationResult;
  annual: AnnualProjection | null;
  fin: FinancialResult | null;
}

interface RowDef {
  label: string;
  get: (s: Snapshot) => string;
  num: (s: Snapshot) => number | null;
  unit: string;
  higherIsBetter: boolean | null;
}

const ROWS: RowDef[] = [
  { label: 'Technology', get: s => s.panel.technology, num: () => null, unit: '', higherIsBetter: null },
  { label: 'Tilt', get: s => s.array.tilt.toFixed(0), num: s => s.array.tilt, unit: '°', higherIsBetter: null },
  { label: 'Modules', get: s => s.array.moduleCount.toLocaleString(), num: s => s.array.moduleCount, unit: '', higherIsBetter: null },
  { label: 'AC Power (now)', get: s => (s.result.acPower / 1000).toFixed(1), num: s => s.result.acPower / 1000, unit: 'kW', higherIsBetter: true },
  { label: 'Cell Temp', get: s => s.result.cellTemp.toFixed(1), num: s => s.result.cellTemp, unit: '°C', higherIsBetter: false },
  { label: 'POA Effective', get: s => s.result.poaEffective.toFixed(0), num: s => s.result.poaEffective, unit: 'W/m²', higherIsBetter: true },
  { label: 'Annual Energy', get: s => s.annual ? (s.annual.aepYear1Kwh / 1000).toFixed(0) : '—', num: s => s.annual ? s.annual.aepYear1Kwh / 1000 : null, unit: 'MWh', higherIsBetter: true },
  { label: 'Capacity Factor', get: s => s.annual ? s.annual.capacityFactorPct.toFixed(1) : '—', num: s => s.annual ? s.annual.capacityFactorPct : null, unit: '%', higherIsBetter: true },
  { label: 'Power Density', get: s => s.annual ? s.annual.powerDensityWm2.toFixed(1) : '—', num: s => s.annual ? s.annual.powerDensityWm2 : null, unit: 'W/m²', higherIsBetter: true },
  { label: 'Land Area', get: s => s.annual ? (s.annual.landAreaM2 / 10000).toFixed(1) : '—', num: s => s.annual ? s.annual.landAreaM2 / 10000 : null, unit: 'ha', higherIsBetter: false },
  { label: 'CAPEX Total', get: s => s.fin ? `$${(s.fin.capexTotal / 1e6).toFixed(2)}M` : '—', num: s => s.fin ? s.fin.capexTotal / 1e6 : null, unit: '', higherIsBetter: false },
  { label: 'LCOE', get: s => s.fin ? s.fin.lcoePerMwh.toFixed(1) : '—', num: s => s.fin ? s.fin.lcoePerMwh : null, unit: '$/MWh', higherIsBetter: false },
  { label: 'Net Profit', get: s => s.fin ? `$${(s.fin.netProfit / 1e6).toFixed(1)}M` : '—', num: s => s.fin ? s.fin.netProfit / 1e6 : null, unit: '', higherIsBetter: true },
  { label: 'Break-Even', get: s => s.fin ? (s.fin.breakEvenYear !== null ? `Yr ${s.fin.breakEvenYear}` : 'Never') : '—', num: s => s.fin?.breakEvenYear ?? null, unit: '', higherIsBetter: false },
];

export default function ScenarioCompare({ capture }: { capture: () => Snapshot }) {
  const [scenarios, setScenarios] = useState<Snapshot[]>([]);

  const save = () => {
    if (scenarios.length >= 3) return;
    setScenarios(prev => [...prev, { ...capture(), name: `Scenario ${String.fromCharCode(65 + prev.length)}` }]);
  };

  return (
    <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
          ⚖️ Scenario Comparison (A/B/C)
        </h2>
        <div className="flex gap-2">
          <button onClick={save} disabled={scenarios.length >= 3}
            className="py-1.5 px-3 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-xs font-medium">
            📌 Save Current ({scenarios.length}/3)
          </button>
          {scenarios.length > 0 && (
            <button onClick={() => setScenarios([])}
              className="py-1.5 px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs">Clear</button>
          )}
        </div>
      </div>

      {scenarios.length === 0 && (
        <p className="text-xs text-zinc-500">
          Tune a design → Save. Change tilt/tracker/module/location → Save again. Best values highlight green, worst red.
        </p>
      )}

      {scenarios.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-700">
                <th className="text-left py-1 pr-3">Metric</th>
                {scenarios.map(s => <th key={s.name} className="text-right px-2">{s.name}</th>)}
                {scenarios.length > 1 && <th className="text-right pl-2">Δ (last vs A)</th>}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(r => {
                const vals = scenarios.map(r.num);
                const valid = vals.filter((v): v is number => v !== null);
                const best = r.higherIsBetter === null || valid.length < 2 ? null :
                  r.higherIsBetter ? Math.max(...valid) : Math.min(...valid);
                const worst = r.higherIsBetter === null || valid.length < 2 ? null :
                  r.higherIsBetter ? Math.min(...valid) : Math.max(...valid);
                const base = vals[0];
                const lastV = vals[vals.length - 1];
                const delta = base !== null && lastV !== null && scenarios.length > 1 ? lastV - base : null;
                return (
                  <tr key={r.label} className="border-b border-zinc-800">
                    <td className="py-1.5 pr-3 text-zinc-400">{r.label}</td>
                    {scenarios.map((s, i) => {
                      const v = vals[i];
                      const cls = v !== null && best !== null && v === best ? 'text-emerald-400'
                        : v !== null && worst !== null && v === worst ? 'text-red-400' : 'text-zinc-200';
                      return (
                        <td key={s.name} className={`text-right px-2 font-mono ${cls}`}>
                          {r.get(s)}{r.unit && <span className="text-zinc-500"> {r.unit}</span>}
                        </td>
                      );
                    })}
                    {scenarios.length > 1 && (
                      <td className={`text-right pl-2 font-mono ${
                        delta === null ? 'text-zinc-600' : delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-zinc-500'
                      }`}>
                        {delta === null ? '—' : `${delta > 0 ? '+' : ''}${Math.abs(delta) >= 100 ? delta.toFixed(0) : delta.toFixed(1)}`}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}