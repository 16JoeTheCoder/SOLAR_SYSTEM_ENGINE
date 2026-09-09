// src/components/ReferencesGlossary.tsx
import { useState } from 'react';

const REFERENCES: Array<[string, string, string]> = [
  ['Perez et al. (1990)', 'Anisotropic diffuse transposition model — "Modeling daylight availability and irradiance components"', 'https://doi.org/10.1016/0038-092x(90)90055-h'],
  ['Sandia PVPMC', 'Perez Sky Diffuse Model — implementation guide used by this app', 'https://pvpmc.sandia.gov/modeling-guide/1-weather-design-inputs/plane-of-array-poa-irradiance/calculating-poa-irradiance/poa-sky-diffuse/perez-sky-diffuse-model/'],
  ['pvlib-python', 'Reference implementation of irradiance & thermal models', 'https://pvlib-python.readthedocs.io'],
  ['Faiman (2008)', 'Module temperature model: T_cell = T_amb + G·exp(a + b·wind)', 'https://doi.org/10.1002/pip.813'],
  ['NREL ATB 2024', 'Utility-Scale PV CAPEX, O&M, LCOE baselines', 'https://atb.nrel.gov/electricity/2024/utility-scale_pv'],
  ['LBNL Utility-Scale Solar', 'Empirical installed costs, PPA prices, O&M (FERC data)', 'https://emp.lbl.gov/utility-scale-solar'],
  ['IRENA (2024)', 'Renewable Power Generation Costs — global LCOE benchmarks', 'https://www.irena.org/Publications/2024/Sep/Renewable-Power-Generation-Costs-in-2023'],
  ['ASCE 7-22', 'Minimum Design Loads: Ch. 7 snow, Ch. 29 wind velocity pressure', 'https://ascelibrary.org/doi/book/10.1061/9780784415788'],
  ['Broms (1964)', 'Lateral resistance of piles — short-pile embedment method', 'https://www.icevirtuallibrary.com/doi/10.1680/jsmoj.1964.14.2.69'],
  ['Open-Meteo', 'Live + historical archive weather API used for irradiance', 'https://open-meteo.com/en/docs'],
  ['PVGIS 5.2 (EC JRC)', 'Typical Meteorological Year data (fallback source)', 'https://re.jrc.ec.europa.eu/pvg_tools/en/'],
  ['DOE PVSCM 2024Q1', 'Module spot prices & CAPEX breakdown benchmarks', 'https://www.energy.gov/eere/solar/solar-photovoltaic-system-cost-benchmarks'],
];

const GLOSSARY: Array<[string, string]> = [
  ['GCR', 'Ground Coverage Ratio = module area ÷ land area. Lower GCR → more rear bifacial irradiance but more land. Optimal ≈ 0.35–0.45.'],
  ['Bifaciality φ', 'Rear-face efficiency as fraction of front. HJT ≈ 0.88, TOPCon ≈ 0.83, PERC ≈ 0.68, CdTe = 0.'],
  ['DNI / DHI / GHI', 'Direct Normal, Diffuse Horizontal, Global Horizontal irradiance. GHI = DNI·cos(zenith) + DHI.'],
  ['AOI', 'Angle of Incidence between sun vector and module normal. 0° = perpendicular (maximum capture).'],
  ['POA', 'Plane-of-Array irradiance — total irradiance on the tilted module surface after transposition.'],
  ['Capacity Factor', 'Annual energy ÷ (nameplate × 8760 h). Utility PV: 15–30%.'],
  ['Specific Yield', 'Annual kWh per kWp installed. 1,400–2,100 kWh/kWp depending on resource.'],
  ['LCOE', 'Levelized Cost of Energy: NPV(costs) ÷ NPV(degraded energy) at WACC. Compare to PPA price.'],
  ['P50 / P90 / P99', 'Exceedance probabilities. P90 = yield exceeded with 90% confidence — the lender\'s number.'],
  ['DC/AC Ratio (ILR)', 'Module DC ÷ inverter AC rating. >1.2 clips midday peaks but improves inverter utilization.'],
  ['Performance Ratio', 'Actual yield ÷ theoretical yield at STC irradiance. Modern plants: 80–88%.'],
  ['LID / LeTID', 'First-year light-induced degradation. PERC 2–3% (boron-oxygen), N-type ≈ 1%, HJT ≈ 0.'],
  ['WACC', 'Weighted Average Cost of Capital — blended debt+equity discount rate for NPV/LCOE.'],
  ['DSCR', 'Debt Service Coverage Ratio = cash available ÷ debt payments. Lenders require ≥1.2–1.3.'],
  ['MACRS', 'US 5-yr accelerated depreciation: 20/32/19.2/11.52/11.52/5.76%.'],
  ['Broms Method', 'Short-pile lateral embedment (1964): sand uses Rankine Kp, clay uses 9·c·D.'],
  ['STC', 'Standard Test Conditions: 1000 W/m², 25 °C cell temperature, AM1.5G spectrum.'],
  ['NOCT', 'Nominal Operating Cell Temperature — cell temp at 800 W/m², 20 °C ambient, 1 m/s wind. ≈ 45 °C.'],
];

export default function ReferencesGlossary() {
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex justify-between items-center text-sm font-semibold uppercase tracking-wider text-zinc-300">
        <span>📚 References & Glossary</span>
        <span className="text-zinc-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-5">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">References</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {REFERENCES.map(([name, desc, url]) => (
                <a key={name} href={url} target="_blank" rel="noopener noreferrer"
                  className="bg-zinc-800/60 hover:bg-zinc-700/60 rounded-lg p-3 border border-zinc-700/50 block transition-colors">
                  <div className="text-xs font-semibold text-sky-400">{name} ↗</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{desc}</div>
                </a>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Glossary</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {GLOSSARY.map(([term, text]) => (
                <div key={term} className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-700/50">
                  <div className="text-xs font-semibold text-emerald-400">{term}</div>
                  <div className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}