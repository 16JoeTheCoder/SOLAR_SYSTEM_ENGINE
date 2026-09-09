// src/core/FinancialMath.ts
import type {
  PanelSpec, ArrayConfig, Location, WeatherSnapshot,
  AnnualProjection, FinancialConfig, FinancialResult,
} from './types';
import { simulateStepSafe } from './SolarMath';

/** --------------------------------------------------------------
 *  Annual projection: run the full physics engine over one year
 *  of real hourly historical weather (8760 steps).
 * -------------------------------------------------------------- */
export function computeAnnualProjection(
  panel: PanelSpec,
  array: ArrayConfig,
  location: Location,
  hourly: WeatherSnapshot[]
): AnnualProjection {
  let totalAcWh = 0;
  for (const w of hourly) {
    totalAcWh += simulateStepSafe(panel, array, w, location).acPower; // 1h step → W = Wh
  }

  const hours = Math.max(hourly.length, 1);
  const aepYear1Kwh = totalAcWh / 1000;
  const nameplateKWp = (panel.pmax * array.moduleCount) / 1000;
  const capacityFactorPct = nameplateKWp > 0
    ? (aepYear1Kwh / (nameplateKWp * hours)) * 100
    : 0;

  const moduleAreaM2 = panel.width * panel.height * array.moduleCount;
  const landAreaM2 = moduleAreaM2 / Math.max(array.gcr, 0.01);
  const avgPowerW = totalAcWh / hours;
  const powerDensityWm2 = landAreaM2 > 0 ? avgPowerW / landAreaM2 : 0;

  return { nameplateKWp, aepYear1Kwh, capacityFactorPct, powerDensityWm2, landAreaM2, hoursSimulated: hours };
}

/** --------------------------------------------------------------
 *  Lifetime financial model with per-year degradation
 *  P_retention(t) = (1 − LID) · (1 − d·(t−1))
 * -------------------------------------------------------------- */
export function computeFinancials(
  panel: PanelSpec,
  array: ArrayConfig,
  fin: FinancialConfig,
  aepYear1Kwh: number
): FinancialResult {
  const nameplateW = panel.pmax * array.moduleCount;

  const capexModules = nameplateW * Math.max(fin.moduleCostPerW, 0);
  const capexMounting = capexModules * Math.max(fin.mountingPctOfModule, 0) / 100;
  const capexLand = Math.max(fin.landCostTotal, 0);
  const capexTotal = capexModules + capexMounting + capexLand;

  const omAnnual = Math.max(fin.omCostPerKwYear, 0) * (nameplateW / 1000);
  const availability = Math.min(Math.max(fin.availabilityPct, 0), 100) / 100;
  const years = Math.max(1, Math.round(fin.projectYears));

  let cumulative = -capexTotal;
  let revenueLifetime = 0;
  let lifetimeEnergyMwh = 0;
  let breakEvenYear: number | null = null;
  const yearlyCumulativeCashflow: number[] = [];

  for (let t = 1; t <= years; t++) {
    const retention = Math.max(0, (1 - panel.lid) * (1 - panel.degradationRate * (t - 1)));
    const aepKwh = aepYear1Kwh * retention * availability;
    const revenue = (aepKwh / 1000) * Math.max(fin.ppaPricePerMwh, 0);
    revenueLifetime += revenue;
    lifetimeEnergyMwh += aepKwh / 1000;
    cumulative += revenue - omAnnual;
    yearlyCumulativeCashflow.push(cumulative);
    if (breakEvenYear === null && cumulative >= 0) breakEvenYear = t;
  }

  const omLifetime = omAnnual * years;
  const netProfit = revenueLifetime - omLifetime - capexTotal;
  const lcoePerMwh = lifetimeEnergyMwh > 0 ? (capexTotal + omLifetime) / lifetimeEnergyMwh : 0;

  return {
    capexModules, capexMounting, capexLand, capexTotal,
    omLifetime, revenueLifetime, netProfit,
    breakEvenYear, lcoePerMwh, lifetimeEnergyMwh,
    yearlyCumulativeCashflow,
  };
}