// src/components/AnnualYieldTab.tsx
import { useState } from 'react';
import type { PanelSpec, ArrayConfig, Location, FinancialConfig, FinancialResult } from '../core/types';
import { fetchTMY, runAnnualSimulation } from '../engine/annualYield';
import type { AnnualYieldResult } from '../engine/annualYield';
import { InfoTip } from './InfoTip';
import { Metric } from './inputs';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface YearRow {
  year: number;
  energyMWh: number;
  retentionPct: number;
  cumCashflow: number | null;
  maintenance: string | null;
}

export default function AnnualYieldTab({ panel, array, location, financial, financials, onComputed }: {
  panel: PanelSpec; array: ArrayConfig; location: Location;
  financial: FinancialConfig; financials: FinancialResult | null;
  onComputed: () => void;
}) {
  const [result, setResult] = useState<AnnualYieldResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedYear, setExpandedYear] = useState<number | null>(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const { data, source } = await fetchTMY(location);
      setResult(runAnnualSimulation(panel, array, location, data, 0.05, source));
      onComputed(); // also populate hook-level annual + financials
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Annual fetch failed');
    } finally {
      setBusy(false);
    }
  };

  const maxMonthly = result ? Math.max(...result.monthlyAcMWh, 1e-9) : 1;

  const years = Math.max(1, Math.round(financial.projectYears));
  const timeline: YearRow[] = [];
  if (result) {
    for (let y = 1; y <= years; y++) {
      const retention = (1 - panel.lid) * Math.max(0, 1 - panel.degradationRate * (y - 1));
      const energyMWh = result.p50MWh * retention * (financial.availabilityPct / 100);
      const cumCashflow = financials?.yearlyCumulativeCashflow[y - 1] ?? null;
      let maintenance: string | null = null;
      if (y === 12) maintenance = '🔧 Inverter replacement';
      else if (y % 5 === 0) maintenance = '🧼 Major inspection & cleaning';
      timeline.push({ year: y, energyMWh, retentionPct: retention * 100, cumCashflow, maintenance });
    }
  }
  const maxEnergy = timeline.length ? Math.max(...timeline.map(t => t.energyMWh)) : 1;

  return (
    <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
        📈 Annual Yield Engine — 8,760 h simulation
        <InfoTip id="availability" />
      </h2>

      <button onClick={run} disabled={busy}
        className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm font-medium transition-colors">
        {busy ? '⏳ Fetching weather year + simulating 8,760 hours…' : '▶ Run Annual Simulation'}
      </button>
      {error && <p className="text-xs text-red-400 font-mono">{error}</p>}

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Annual AC (P50)" value={result.annualAcMWh.toFixed(1)} unit="MWh" accent="text-emerald-400" />
            <Metric label="P90 (bankable)" value={result.p90MWh.toFixed(1)} unit="MWh" accent="text-amber-400" />
            <Metric label="P99" value={result.p99MWh.toFixed(1)} unit="MWh" accent="text-red-400" />
            <Metric label="Capacity Factor" value={result.capacityFactorPct.toFixed(1)} unit="%" />
            <Metric label="Specific Yield" value={result.specificYieldKwhPerKwp.toFixed(0)} unit="kWh/kWp" />
            <Metric label="Annual DC" value={result.annualDcMWh.toFixed(1)} unit="MWh" />
            <Metric label="25-yr Lifetime" value={(result.lifetimeAcMWh25yr / 1000).toFixed(1)} unit="GWh" />
            <Metric label="Data Source" value={result.source.split(' ')[0]} unit="" accent="text-sky-400" />
          </div>

          {/* Monthly chart */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Monthly Generation (MWh)</div>
            <div className="flex items-end gap-1 h-28">
              {result.monthlyAcMWh.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <div className="w-full bg-sky-500/80 rounded-t" style={{ height: `${(v / maxMonthly) * 100}%` }}
                    title={`${MONTHS[i]}: ${v.toFixed(1)} MWh`} />
                  <span className="text-[9px] text-zinc-500">{MONTHS[i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Year-by-year timeline */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Project Timeline — degradation, break-even & maintenance ({years} yr)
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex items-end gap-[3px] h-32 min-w-max">
                {timeline.map((t) => {
                  const isBreakEven = t.cumCashflow !== null && t.cumCashflow >= 0 &&
                    (timeline[t.year - 2]?.cumCashflow ?? -1) < 0;
                  return (
                    <button key={t.year} onClick={() => setExpandedYear(expandedYear === t.year ? null : t.year)}
                      className="flex flex-col items-center justify-end gap-0.5 h-full w-6 group">
                      <div
                        className={`w-full rounded-t transition-colors group-hover:brightness-125 ${
                          isBreakEven ? 'bg-emerald-400' :
                          t.cumCashflow !== null && t.cumCashflow >= 0 ? 'bg-emerald-600/70' : 'bg-sky-600/70'
                        }`}
                        style={{ height: `${(t.energyMWh / maxEnergy) * 78}%` }}
                        title={`Year ${t.year}: ${t.energyMWh.toFixed(1)} MWh`}
                      />
                      <span className="text-[8px] text-zinc-500">{t.year}</span>
                      <span className="text-[8px] h-3">{t.maintenance ? '🔧' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-[10px] text-zinc-500 mt-1">
              <span><span className="text-sky-400">■</span> pre-break-even</span>
              <span><span className="text-emerald-400">■</span> profitable years</span>
              <span>🔧 yr 12 inverter replacement · every 5 yr major inspection</span>
            </div>
            {expandedYear !== null && timeline[expandedYear - 1] && (
              <div className="mt-2 bg-zinc-900/70 border border-zinc-700 rounded-lg p-3 text-xs font-mono text-zinc-300">
                Year {expandedYear}: {timeline[expandedYear - 1].energyMWh.toFixed(1)} MWh ·
                retention {timeline[expandedYear - 1].retentionPct.toFixed(1)}% ·
                cumulative cashflow {timeline[expandedYear - 1].cumCashflow !== null
                  ? `$${(timeline[expandedYear - 1].cumCashflow! / 1e6).toFixed(2)}M`
                  : 'run financials'}
                {timeline[expandedYear - 1].maintenance ? ` · ${timeline[expandedYear - 1].maintenance}` : ''}
              </div>
            )}
          </div>

          <p className="text-[10px] text-zinc-500">
            Source: {result.source} · Perez transposition + Faiman thermal + inverter clipping per hour ·
            P90 = P50·(1−1.282σ), σ=5% · cached in browser.
          </p>
        </>
      )}
    </section>
  );
}