// src/tools/solar/SolarDashboard.tsx
import { useState, useEffect } from 'react';
import { useSolarSimulation } from '../../hooks/useSolarSimulation';
import { computeSunPosition, getTimezoneOffset } from '../../core/api/openMeteo';
import { PRESET_LIST, PANEL_PRESETS } from '../../core/panelPresets';
import MapPicker from '../../components/MapPicker';
import AnnualYieldTab from '../../components/AnnualYieldTab';
import StructuralTab from '../../components/StructuralTab';
import LCOEDashboard from '../../components/LCOEDashboard';
import ScenarioCompare from '../../components/ScenarioCompare';
import ReferencesGlossary from '../../components/ReferencesGlossary';
import { PROJECT_GALLERY } from '../../data/projectGallery';
import { generateNarrative } from '../../engine/narrative';
import { encodeState, decodeState } from '../../engine/shareLink';
import { ModeContext, ModeToggle, InfoTip } from '../../components/InfoTip';
import type { Mode } from '../../components/InfoTip';
import { Slider, NumField, Metric } from '../../components/inputs';
import Array3D from '../../components/Array3D';

const TIMEZONES = [
  'Asia/Jakarta', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Dubai',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'Australia/Sydney', 'Pacific/Auckland', 'UTC',
];

function SectionTitle({ children, info }: { children: string; info?: string }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
      {children}{info && <InfoTip id={info} />}
    </h2>
  );
}

export default function SolarDashboard() {
  const sim = useSolarSimulation();
  const { result, weather, array, panel, financial, loading, usingFallback, apiError } = sim;

  const [mode, setMode] = useState<Mode>('undergraduate');
  const [narrative, setNarrative] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);

  const sun = computeSunPosition(
    weather.time, sim.location.latitude, sim.location.longitude,
    getTimezoneOffset(sim.location.timezone)
  );
  const sunElevation = 90 - sun.zenith;
  const isNight = sunElevation < 0;

  // Share-link hydration on load
  useEffect(() => {
    const shared = decodeState(window.location.hash);
    if (shared) {
      sim.updatePanel(shared.panel);
      sim.updateArray(shared.array);
      sim.updateLocation(shared.location);
      sim.updateFinancial(shared.financial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyShareLink = () => {
    const hash = encodeState({ panel, array, location: sim.location, financial });
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    navigator.clipboard.writeText(url).catch(() => window.prompt('Copy link:', url));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') sim.runAnnualProjection();
      if (e.key === 'l' || e.key === 'L') copyShareLink();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <ModeContext.Provider value={mode}>
      <div className="min-h-screen bg-zinc-900 text-white p-6">
        {/* Header + mode toggle */}
        <header className="mb-6 flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">☀️ Bifacial PV Farm Simulator & Financial Model</h1>
            <p className="text-sm text-zinc-400 mt-1">
              {sim.location.name ?? 'Custom Site'} · {sim.location.latitude.toFixed(4)}°, {sim.location.longitude.toFixed(4)}°
            </p>
          </div>
          <ModeToggle mode={mode} setMode={setMode} />
        </header>

        <div className="space-y-6">
          {/* 1. SITE SELECTOR */}
          <MapPicker onSiteSelect={(site) => {
            sim.updateLocation({ latitude: site.latitude, longitude: site.longitude });
          }} />

          {/* 2. PANEL SETTINGS (left 50%) + 3D PLACEHOLDER (right 50%) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50 space-y-4">
              <SectionTitle info="efficiencyStc">Panel Technology</SectionTitle>
              <div className="grid grid-cols-5 gap-1">
                {PRESET_LIST.map((tech) => (
                  <button key={tech} onClick={() => sim.applyPreset(tech)}
                    className={`py-1.5 rounded text-xs font-medium transition-colors ${
                      panel.technology === tech ? 'bg-emerald-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}>
                    {tech}
                  </button>
                ))}
              </div>
              <Slider label="Module Power (Pmax)" unit="W" value={panel.pmax} min={100} max={800} step={5} info="pmax"
                onChange={(v) => sim.updatePanel({ pmax: v })} />
              <Slider label="Efficiency STC" unit="" value={panel.efficiencyStc} min={0.10} max={0.30} step={0.005} info="efficiencyStc"
                onChange={(v) => sim.updatePanel({ efficiencyStc: v })} />
              <Slider label="Temp Coeff γ" unit="%/°C" value={panel.tempCoeffPmax} min={-0.5} max={-0.2} step={0.01} info="tempCoeff"
                onChange={(v) => sim.updatePanel({ tempCoeffPmax: v })} />
              <Slider label="Bifaciality φ" unit="" value={panel.bifaciality} min={0} max={0.95} step={0.05} info="bifaciality"
                onChange={(v) => sim.updatePanel({ bifaciality: v })} />
              <Slider label="Year-1 LID" unit="" value={panel.lid} min={0} max={0.05} step={0.005} info="lid"
                onChange={(v) => sim.updatePanel({ lid: v })} />
              <Slider label="Degradation /yr" unit="" value={panel.degradationRate} min={0} max={0.01} step={0.0005} info="degradation"
                onChange={(v) => sim.updatePanel({ degradationRate: v })} />
              <NumField label="Module Width" unit="m" value={panel.width} min={0.5} max={2} step={0.001}
                onChange={(v) => sim.updatePanel({ width: v })} />
              <NumField label="Module Height" unit="m" value={panel.height} min={0.5} max={3} step={0.001}
                onChange={(v) => sim.updatePanel({ height: v })} />

              <SectionTitle info="tilt">Array Geometry</SectionTitle>
              <Slider label="Tilt" unit="°" value={array.tilt} min={0} max={90} step={1} info="tilt"
                onChange={(v) => sim.updateArray({ tilt: v })} />


              <Slider label="Azimuth (180=S)" unit="°" value={array.azimuth} min={0} max={360} step={5} info="azimuth"
                onChange={(v) => sim.updateArray({ azimuth: v })} />
              <Slider label="Ground Albedo" unit="" value={array.albedo} min={0} max={0.9} step={0.05} info="albedo"
                onChange={(v) => sim.updateArray({ albedo: v })} />
              <Slider label="GCR (row pitch)" unit="" value={array.gcr} min={0.1} max={0.9} step={0.05} info="gcr"
                onChange={(v) => sim.updateArray({ gcr: v })} />
              <Slider label="Mount Height" unit="m" value={array.height} min={0} max={3} step={0.1} info="height"
                onChange={(v) => sim.updateArray({ height: v })} />
              <Slider label="Module Count" unit="" value={array.moduleCount} min={1} max={100000} step={100} info="moduleCount"
                onChange={(v) => sim.updateArray({ moduleCount: Math.round(v) })} />
              <Slider label="System Losses" unit="" value={array.systemLosses} min={0} max={0.3} step={0.01} info="systemLosses"
                onChange={(v) => sim.updateArray({ systemLosses: v })} />
              <Slider label="DC/AC Ratio" unit="" value={array.dcAcRatio} min={1.0} max={1.6} step={0.05} info="dcAcRatio"
                onChange={(v) => sim.updateArray({ dcAcRatio: v })} />
            </section>

            {/* 3D ARRAY VISUALIZATION — live, interactive */}
              <section className="rounded-xl border border-zinc-700/50 bg-zinc-800/20 overflow-hidden">
              <Array3D
                panel={panel}
                array={array}
                location={sim.location}
                timestamp={weather.time}
                timezone={sim.location.timezone}
                result={result}
              />
            </section>
          </div>

          {/* 3. WEATHER + LIVE POWER (paired) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50 space-y-4">
              <SectionTitle>Weather Station</SectionTitle>
              <div className={`rounded-lg p-3 border text-xs ${
                loading ? 'bg-amber-950/60 border-amber-700/50 text-amber-300'
                : usingFallback ? 'bg-red-950/60 border-red-700/50 text-red-300'
                : 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300'
              }`}>
                {loading && '⏳ Fetching live weather…'}
                {!loading && usingFallback && `⚠️ Offline mode — synthetic weather. ${apiError ?? ''}`}
                {!loading && !usingFallback && (
                  <>● Live Open-Meteo data
                    {sim.lastUpdated && (
                      <span className="block text-[10px] text-emerald-500 mt-0.5">
                        Updated {new Date(sim.lastUpdated).toLocaleTimeString()}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="DNI" value={weather.dni.toFixed(0)} unit="W/m²" />
                <Metric label="GHI" value={weather.ghi.toFixed(0)} unit="W/m²" />
                <Metric label="Ambient" value={weather.tempAir.toFixed(1)} unit="°C" />
                <Metric label="Sun Elev" value={sunElevation.toFixed(1)} unit="°"
                  accent={isNight ? 'text-indigo-400' : 'text-amber-400'} />
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs text-zinc-400 font-medium">Timezone</span>
                <select value={sim.location.timezone}
                  onChange={(e) => sim.updateLocation({ timezone: e.target.value })}
                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-emerald-400 focus:outline-none focus:border-emerald-500">
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <button onClick={sim.refetchWeather} disabled={sim.cooldownSeconds > 0 || loading}
                className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors">
                {sim.cooldownSeconds > 0 ? `↻ Refresh in ${sim.cooldownSeconds}s` : '↻ Refresh Live Weather'}
              </button>
            </section>

            <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50 space-y-4">
              <SectionTitle>Live Power Output</SectionTitle>
              {isNight && (
                <div className="bg-indigo-950/60 border border-indigo-700/50 rounded-lg p-3 text-xs text-indigo-300">
                  🌙 Sun below horizon here right now ({sunElevation.toFixed(1)}°). Zero power is correct.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Metric label="AC Power" value={(result.acPower / 1000).toFixed(2)} unit="kW" accent="text-emerald-400" />
                <Metric label="DC Power" value={(result.dcPower / 1000).toFixed(2)} unit="kW" />
                <Metric label="Performance Ratio" value={result.performanceRatio.toFixed(1)} unit="%" />
                <Metric label="Cell Temp" value={result.cellTemp.toFixed(1)} unit="°C"
                  accent={result.cellTemp > 60 ? 'text-red-400' : 'text-white'} />
                <Metric label="POA Effective" value={result.poaEffective.toFixed(0)} unit="W/m²" accent="text-sky-400" />
                <Metric label="AOI" value={result.aoI.toFixed(1)} unit="°" />
              </div>
            </section>
          </div>

          {/* 4. ANNUAL YIELD ENGINE (merged, with timeline) */}
          <AnnualYieldTab
            panel={panel} array={array} location={sim.location}
            financial={financial} financials={sim.financials}
            onComputed={() => sim.runAnnualProjection()}
          />

          {/* 5. STRUCTURAL */}
          <StructuralTab panel={panel} array={array} />

          {/* 6. FINANCIAL INPUTS + LCOE */}
          <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50 space-y-4">
            <SectionTitle info="moduleCost">Financial Inputs</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Slider label="Module Cost" unit="$/W" value={financial.moduleCostPerW} min={0.05} max={0.5} step={0.005} info="moduleCost"
                onChange={(v) => sim.updateFinancial({ moduleCostPerW: v })} />
              <Slider label="Mounting + Labor (% of module)" unit="%" value={financial.mountingPctOfModule} min={0} max={300} step={5} info="mounting"
                onChange={(v) => sim.updateFinancial({ mountingPctOfModule: v })} />
              <NumField label="Land Cost (total)" unit="$" value={financial.landCostTotal} min={0} max={1e9} step={1000}
                onChange={(v) => sim.updateFinancial({ landCostTotal: v })} />
              <Slider label="O&M Cost" unit="$/kW/yr" value={financial.omCostPerKwYear} min={0} max={40} step={0.5} info="om"
                onChange={(v) => sim.updateFinancial({ omCostPerKwYear: v })} />
              <Slider label="Grid Sale Price (PPA)" unit="$/MWh" value={financial.ppaPricePerMwh} min={0} max={200} step={1} info="ppa"
                onChange={(v) => sim.updateFinancial({ ppaPricePerMwh: v })} />
              <Slider label="Project Lifetime" unit="yr" value={financial.projectYears} min={5} max={40} step={1}
                onChange={(v) => sim.updateFinancial({ projectYears: Math.round(v) })} />
              <Slider label="Availability Factor" unit="%" value={financial.availabilityPct} min={80} max={100} step={0.5} info="availability"
                onChange={(v) => sim.updateFinancial({ availabilityPct: v })} />
            </div>
          </section>

          <LCOEDashboard
            annualMWh={sim.annual ? sim.annual.aepYear1Kwh / 1000 : 1000}
            capexTotal={sim.financials ? sim.financials.capexTotal : 100000}
            nameplateKWac={panel.pmax * array.moduleCount / 1000 / array.dcAcRatio}
          />

          {/* 7. SCENARIO COMPARISON */}
          <ScenarioCompare capture={() => ({
            name: '', panel, array,
            result: sim.result, annual: sim.annual, fin: sim.financials,
          })} />

          {/* 8. EXPORT & SHARE */}
          <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50 space-y-3">
            <SectionTitle>Export & Share</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setNarrative(generateNarrative(panel, array, sim.location, sim.annual, sim.financials))}
                className="py-2 px-4 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-medium">
                ✨ Generate Design Narrative
              </button>
              <button onClick={copyShareLink}
                className="py-2 px-4 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium">
                🔗 Copy Share Link <span className="text-[10px] opacity-70">(L)</span>
              </button>
              <button onClick={() => window.print()}
                className="py-2 px-4 bg-zinc-600 hover:bg-zinc-500 rounded-lg text-sm font-medium">
                🖨️ Export PDF (Print)
              </button>
            </div>
            {narrative && (
              <>
                <textarea readOnly value={narrative} rows={6}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs font-mono text-zinc-300 focus:outline-none" />
                <button onClick={() => navigator.clipboard.writeText(narrative)}
                  className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium">
                  📋 Copy Narrative
                </button>
              </>
            )}
          </section>

          {/* 9. PROJECT GALLERY (collapsible) */}
          <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50">
            <button onClick={() => setGalleryOpen(g => !g)}
              className="w-full flex justify-between items-center text-sm font-semibold uppercase tracking-wider text-zinc-300">
              <span>🏆 Real-World Project Gallery</span>
              <span className="text-zinc-500">{galleryOpen ? '▲' : '▼'}</span>
            </button>
            {galleryOpen && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                {PROJECT_GALLERY.map((g) => (
                  <button key={g.name}
                    onClick={() => {
                      sim.updateLocation({ latitude: g.latitude, longitude: g.longitude, timezone: g.timezone, name: g.name });
                      sim.updateArray({ moduleCount: g.moduleCount, tilt: g.tilt });
                      if (g.technology !== 'Custom') sim.applyPreset(g.technology as keyof typeof PANEL_PRESETS);
                    }}
                    className="text-left bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/50 rounded-lg p-3 transition-colors">
                    <div className="text-xs font-semibold text-white">{g.name}</div>
                    <div className="text-[10px] text-zinc-500">{g.country} · {g.technology}</div>
                    <div className="text-[10px] text-zinc-500 mt-1">{g.note}</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 10. REFERENCES & GLOSSARY */}
          <ReferencesGlossary />
        </div>
      </div>
    </ModeContext.Provider>
  );
}