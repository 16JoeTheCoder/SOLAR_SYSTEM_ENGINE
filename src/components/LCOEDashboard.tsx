// src/components/LCOEDashboard.tsx
import { useState, useMemo } from 'react';
import { runProjectFinance } from '../engine/financial';
import { Slider, NumField, Metric } from './inputs';

export default function LCOEDashboard({ annualMWh, capexTotal, nameplateKWac }: {
  annualMWh: number;        // pass sim.annual.aepYear1Kwh/1000, or a default
  capexTotal: number;       // pass sim.financials.capexTotal, or a default
  nameplateKWac: number;
}) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState({
    degradationAnnual: 0.005, lifetimeYears: 25,
    opexPerKwacYr: 22, opexEscalation: 0.02,
    ppaPricePerMWh: 45, ppaEscalation: 0.01,
    wacc: 0.07, debtFraction: 0.7, debtRate: 0.055, debtTermYears: 18,
    taxRate: 0.25, itc: 0.0, curtailmentPct: 0, inflationPct: 2.5,
  });
  const u = (patch: Partial<typeof p>) => setP(prev => ({ ...prev, ...patch }));

  const out = useMemo(() => runProjectFinance({
    annualAcMWhYear1: annualMWh,
    capexTotal,
    nameplateKWac,
    macrs: p.itc > 0,
    ...p,
  }), [p, annualMWh, capexTotal, nameplateKWac]);

  const viable = out.lcoeNominal <= p.ppaPricePerMWh;

  return (
    <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50 space-y-4">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex justify-between items-center text-sm font-semibold uppercase tracking-wider text-zinc-300">
        <span>💰 Project Finance / LCOE (NREL ATB method)</span>
        <span className="text-zinc-500">{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {open && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-3">
              <Slider label="PPA Price" unit="$/MWh" value={p.ppaPricePerMWh} min={10} max={150} step={1}
                onChange={(v) => u({ ppaPricePerMWh: v })} />
              <Slider label="PPA Escalation" unit="" value={p.ppaEscalation} min={0} max={0.05} step={0.005}
                onChange={(v) => u({ ppaEscalation: v })} />
              <Slider label="O&M" unit="$/kW/yr" value={p.opexPerKwacYr} min={5} max={40} step={0.5}
                onChange={(v) => u({ opexPerKwacYr: v })} />
              <Slider label="Curtailment" unit="%" value={p.curtailmentPct} min={0} max={20} step={0.5}
                onChange={(v) => u({ curtailmentPct: v })} />
            </div>
            <div className="space-y-3">
              <Slider label="WACC" unit="" value={p.wacc} min={0.02} max={0.15} step={0.005}
                onChange={(v) => u({ wacc: v })} />
              <Slider label="Debt Fraction" unit="" value={p.debtFraction} min={0} max={0.9} step={0.05}
                onChange={(v) => u({ debtFraction: v })} />
              <Slider label="Debt Rate" unit="" value={p.debtRate} min={0.01} max={0.12} step={0.005}
                onChange={(v) => u({ debtRate: v })} />
              <NumField label="Debt Term" unit="yr" value={p.debtTermYears} min={5} max={30}
                onChange={(v) => u({ debtTermYears: Math.round(v) })} />
            </div>
            <div className="space-y-3">
              <Slider label="Tax Rate" unit="" value={p.taxRate} min={0} max={0.4} step={0.01}
                onChange={(v) => u({ taxRate: v })} />
              <Slider label="ITC" unit="" value={p.itc} min={0} max={0.5} step={0.05}
                onChange={(v) => u({ itc: v })} />
              <Slider label="Degradation" unit="/yr" value={p.degradationAnnual} min={0} max={0.01} step={0.0005}
                onChange={(v) => u({ degradationAnnual: v })} />
              <Slider label="Inflation" unit="%" value={p.inflationPct} min={0} max={8} step={0.5}
                onChange={(v) => u({ inflationPct: v })} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="LCOE (nominal)" value={out.lcoeNominal.toFixed(1)} unit="$/MWh"
              accent={viable ? 'text-emerald-400' : 'text-red-400'} />
            <Metric label="LCOE (real)" value={out.lcoeReal.toFixed(1)} unit="$/MWh" />
            <Metric label="NPV" value={out.npv >= 1e6 ? `${(out.npv / 1e6).toFixed(2)}M` : `${(out.npv / 1e3).toFixed(0)}k`}
              unit="$" accent={out.npv >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <Metric label="Equity IRR" value={out.equityIRR !== null ? (out.equityIRR * 100).toFixed(1) : 'n/a'} unit="%" />
            <Metric label="Payback" value={out.paybackYears !== null ? String(out.paybackYears) : 'never'} unit="yr" />
            <Metric label="DSCR min" value={Number.isFinite(out.dscrMin) ? out.dscrMin.toFixed(2) : 'n/a'} unit=""
              accent={out.dscrMin >= 1.2 ? 'text-emerald-400' : 'text-red-400'} />
            <Metric label="DSCR avg" value={Number.isFinite(out.dscrAvg) ? out.dscrAvg.toFixed(2) : 'n/a'} unit="" />
            <Metric label="Verdict" value={viable ? '✅ VIABLE' : '❌ LCOE > PPA'} unit=""
              accent={viable ? 'text-emerald-400' : 'text-red-400'} />
          </div>
          <p className="text-[10px] text-zinc-500">
            Waterfall: Revenue − OPEX − Debt − Tax. 5-yr MACRS when ITC &gt; 0.
            LCOE = NPV(costs)/NPV(degraded energy) @ WACC. Real LCOE uses Fisher-deflated rate.
          </p>
        </>
      )}
    </section>
  );
}