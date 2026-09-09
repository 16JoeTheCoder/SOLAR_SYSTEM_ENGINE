// src/engine/narrative.ts
/** Zero-API "AI" narrative — template strings over real computed values. */
import type { PanelSpec, ArrayConfig, Location, AnnualProjection, FinancialResult } from '../core/types';

export function generateNarrative(
  panel: PanelSpec,
  array: ArrayConfig,
  location: Location,
  annual: AnnualProjection | null,
  fin: FinancialResult | null
): string {
  const nameplateMW = (panel.pmax * array.moduleCount / 1e6).toFixed(2);
  const trackerText = array.tracker === 'fixed' ? 'fixed-tilt' : 'single-axis tracker';
  const bifacialText = panel.bifaciality > 0
    ? `bifacial (φ = ${panel.bifaciality.toFixed(2)})` : 'monofacial';

  let s = `This ${nameplateMW} MWdc ${trackerText} photovoltaic plant at ` +
    `${location.latitude.toFixed(3)}°, ${location.longitude.toFixed(3)}° ` +
    `(${location.timezone}) deploys ${array.moduleCount.toLocaleString()} × ${panel.pmax} W ` +
    `${panel.technology} modules — ${bifacialText}, STC efficiency ` +
    `${(panel.efficiencyStc * 100).toFixed(1)}%, temperature coefficient ` +
    `${panel.tempCoeffPmax.toFixed(2)} %/°C. Modules are mounted at ${array.tilt.toFixed(0)}° tilt, ` +
    `azimuth ${array.azimuth.toFixed(0)}°, ground coverage ratio ${array.gcr.toFixed(2)}, ` +
    `with a DC/AC ratio of ${array.dcAcRatio.toFixed(2)} and ${(array.systemLosses * 100).toFixed(0)}% system losses. ` +
    `Degradation model: ${(panel.lid * 100).toFixed(1)}% first-year LID plus ` +
    `${(panel.degradationRate * 100).toFixed(2)}%/yr linear.`;

  if (annual) {
    s += ` Simulated over 8,760 hourly weather records, Year-1 generation is ` +
      `${(annual.aepYear1Kwh / 1000).toFixed(1)} MWh (capacity factor ` +
      `${annual.capacityFactorPct.toFixed(1)}%), occupying ${(annual.landAreaM2 / 10000).toFixed(1)} ha ` +
      `at ${annual.powerDensityWm2.toFixed(1)} W/m² average power density.`;
  }
  if (fin) {
    s += ` Total CAPEX is $${(fin.capexTotal / 1e6).toFixed(2)}M ` +
      `(modules $${(fin.capexModules / 1e6).toFixed(2)}M, mounting $${(fin.capexMounting / 1e6).toFixed(2)}M, ` +
      `land $${(fin.capexLand / 1e3).toFixed(0)}k). Levelized cost is $${fin.lcoePerMwh.toFixed(1)}/MWh ` +
      `with lifetime revenue $${(fin.revenueLifetime / 1e6).toFixed(1)}M. ` +
      (fin.breakEvenYear !== null
        ? `The project breaks even in year ${fin.breakEvenYear}.`
        : `The project does not break even within its lifetime under current assumptions.`);
  }
  return s;
}