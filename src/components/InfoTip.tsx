// src/components/InfoTip.tsx
import { createContext, useContext, useState } from 'react';

export type Mode = 'expert' | 'undergraduate' | 'beginner';
export const ModeContext = createContext<Mode>('undergraduate');
export const useMode = () => useContext(ModeContext);

/** Explanation library: [undergraduate, beginner] */
const EXPLANATIONS: Record<string, { u: string; b: string; median?: string }> = {
  tilt: {
    u: 'Angle of modules from horizontal. Optimal ≈ site latitude for fixed-tilt. Steeper favors winter, flatter favors summer.',
    b: 'How steeply the panels lean. A good starting point is to match your latitude — Jakarta (~6°S) likes nearly flat panels.',
    median: '≈ site latitude (10–30° typical)',
  },
  azimuth: {
    u: 'Compass direction modules face. 180° = south (northern hemisphere optimum), 0° = north (southern hemisphere).',
    b: 'Which way the panels face. Above the equator, face south. Below it, face north.',
    median: '180° (N hemisphere) / 0° (S hemisphere)',
  },
  albedo: {
    u: 'Ground reflectivity (0–1). Drives bifacial rear-side gain. Grass ≈ 0.2, concrete ≈ 0.3, sand ≈ 0.4, snow ≈ 0.8.',
    b: 'How much light the ground bounces back up onto the rear of the panels. Bright ground = free extra energy.',
    median: '0.2 (grass)',
  },
  gcr: {
    u: 'Ground Coverage Ratio = module area ÷ land area. Lower GCR → wider row spacing → less row shading + more rear irradiance, but more land.',
    b: 'How tightly packed the panel rows are. Spread them out and each panel sees more light, but you need more land.',
    median: '0.35–0.45',
  },
  height: {
    u: 'Bottom-edge clearance above ground. Higher mounts improve bifacial view factor and reduce soiling, but increase structural loads.',
    b: 'How high off the ground the panels sit. Higher panels catch more bounced light on their backs.',
    median: '1.0 m',
  },
  moduleCount: {
    u: 'Total modules in the plant. Nameplate DC capacity = count × module Pmax.',
    b: 'How many panels your farm has. More panels = more power.',
    median: 'Project-specific',
  },
  systemLosses: {
    u: 'Aggregate derate: soiling, wiring, mismatch, inverter, downtime. NREL ATB assumes ~14% total.',
    b: 'Real-world losses from dirt, wires, and electronics. Nothing is 100% efficient.',
    median: '0.14 (14%)',
  },
  dcAcRatio: {
    u: 'DC nameplate ÷ inverter AC rating (ILR). >1.2 improves inverter utilization but clips midday peaks.',
    b: 'Panels vs. inverter size. Slightly more panel than inverter is normal — the inverter is busy more hours of the day.',
    median: '1.2–1.3',
  },
  pmax: {
    u: 'Module rated power at STC (1000 W/m², 25 °C cell, AM1.5G).',
    b: 'The panel\'s "nameplate" power under perfect lab conditions.',
    median: '450–600 W (utility modules)',
  },
  efficiencyStc: {
    u: 'Module conversion efficiency at STC. TOPCon 22–24%, HJT 22.5–24.5%, PERC 20.5–22%, CdTe 18.5–19.7%.',
    b: 'What fraction of sunlight becomes electricity. Modern panels convert about one-fifth.',
    median: '21–23%',
  },
  tempCoeff: {
    u: 'Power loss per °C above 25 °C cell temperature. HJT (−0.25) beats PERC (−0.36) — decisive in hot climates.',
    b: 'Panels lose power when hot. A smaller (less negative) number means the panel handles heat better.',
    median: '−0.30 %/°C',
  },
  bifaciality: {
    u: 'Rear-face efficiency as fraction of front. HJT 0.85–0.90, TOPCon 0.80–0.85, PERC 0.65–0.70, CdTe 0.',
    b: 'How well the BACK of the panel works compared to the front. Glass-back thin-film (CdTe) has no rear side at all.',
    median: '0.75–0.85 (bifacial modules)',
  },
  lid: {
    u: 'First-year Light-Induced Degradation. PERC suffers 2–3% (boron-oxygen); HJT ≈ 0; TOPCon ≈ 1%.',
    b: 'Panels lose a little power permanently in their first year in the sun. Newer panel types lose less.',
    median: '1%',
  },
  degradation: {
    u: 'Linear annual power decline after year 1. HJT 0.25–0.30%/yr, TOPCon 0.40, PERC 0.55–0.70, CdTe 0.30.',
    b: 'Every year panels get slightly weaker — like a phone battery aging, but much slower.',
    median: '0.4 %/yr',
  },
  moduleCost: {
    u: 'Module spot price. SE-Asia spot 2024: $0.10–0.13/W (DOE PVSCM).',
    b: 'What one watt of panel capacity costs to buy.',
    median: '$0.115/W',
  },
  mounting: {
    u: 'Racking + structural + install labor as % of module cost. Fixed-tilt ≈ 100%, trackers ≈ 120–140%.',
    b: 'The metal frames and the work to install them, priced relative to the panels themselves.',
    median: '110%',
  },
  om: {
    u: 'Annual operations & maintenance per kW. LBNL empirical median $11/kWac-yr (direct); NREL ATB all-in $22/kWac-yr.',
    b: 'Yearly cost to keep the farm running: cleaning, repairs, insurance, land lease.',
    median: '$12–22/kW/yr',
  },
  ppa: {
    u: 'Power Purchase Agreement price — what the grid pays per MWh. US utility avg ≈ $29/MWh (LBNL 2024), corporate ≈ $57/MWh.',
    b: 'The price you sell your electricity for. If your cost (LCOE) is below this, you make money.',
    median: '$30–60/MWh by region',
  },
  availability: {
    u: 'Fraction of time the plant can operate (excl. maintenance outages). Industry standard 98–99%.',
    b: 'How often the plant is actually working versus broken or under repair.',
    median: '98%',
  },
  wacc: {
    u: 'Weighted Average Cost of Capital — blended cost of debt + equity. The discount rate for NPV/LCOE.',
    b: 'The "interest rate" investors expect. Higher risk projects need a higher number.',
    median: '6–8%',
  },
  dscr: {
    u: 'Debt Service Coverage Ratio = cash available ÷ debt payments. Lenders require min ≈ 1.2–1.3.',
    b: 'Can the project pay its loans? Above 1.2 means comfortable headroom; below 1.0 means missed payments.',
    median: '≥1.3 (bankable)',
  },
  lcoe: {
    u: 'Levelized Cost of Energy: lifetime costs ÷ lifetime energy, both discounted at WACC. Compare directly to PPA price.',
    b: 'The true average cost of making one unit of electricity over the whole project life. Sell above this = profit.',
    median: 'Global avg ≈ $43/MWh (IRENA 2024)',
  },
};

export function InfoTip({ id }: { id: string }) {
  const mode = useMode();
  const [open, setOpen] = useState(false);
  if (mode === 'expert') return null;
  const e = EXPLANATIONS[id];
  if (!e) return null;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-zinc-600 hover:bg-sky-500 text-[9px] text-white align-middle transition-colors"
        aria-label="info"
      >
        i
      </button>
      {open && (
        <span className="absolute z-50 left-5 top-0 w-64 bg-zinc-900 border border-zinc-600 rounded-lg p-3 text-[11px] text-zinc-300 leading-relaxed shadow-xl block">
          {mode === 'beginner' ? e.b : e.u}
          {e.median && (
            <span className="block mt-1.5 text-emerald-400 font-mono text-[10px]">
              Typical: {e.median}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 border border-zinc-700">
      {(['beginner', 'undergraduate', 'expert'] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
            mode === m ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}