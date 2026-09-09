// src/core/types.ts
export interface Location {
  latitude: number;
  longitude: number;
  timezone: string;
  name?: string;
}

export type PanelTechnology = 'TOPCon' | 'HJT' | 'xBC' | 'PERC' | 'CdTe' | 'Custom';

export interface PanelSpec {
  pmax: number;               // W at STC
  efficiencyStc: number;      // 0–1
  tempCoeffPmax: number;      // %/°C (negative)
  bifaciality: number;        // 0–1
  width: number;              // m
  height: number;             // m
  technology: PanelTechnology;
  lid: number;                // Year-1 light-induced degradation (fraction, e.g. 0.01)
  degradationRate: number;    // Annual linear degradation (fraction/yr, e.g. 0.004)
}

export interface ArrayConfig {
  tilt: number;
  azimuth: number;
  gcr: number;
  height: number;
  albedo: number;
  tracker: 'fixed' | 'single_axis_horizontal' | 'single_axis_tilted' | 'dual_axis';
  dcAcRatio: number;
  systemLosses: number;
  moduleCount: number;
}

export interface WeatherSnapshot {
  time: number;
  tempAir: number;
  dni: number;
  dhi: number;
  ghi: number;
  windSpeed: number;
  windDir: number;
  sunZenith: number;
  sunAzimuth: number;
}

export interface SimulationResult {
  poaFront: number;
  poaRear: number;
  poaEffective: number;
  cellTemp: number;
  efficiency: number;
  dcPower: number;
  acPower: number;
  specificYield: number;
  performanceRatio: number;
  aoI: number;
}

/** --------------------------------------------------------------
 *  Financial & annual-projection types
 * -------------------------------------------------------------- */
export interface FinancialConfig {
  moduleCostPerW: number;        // $/Wdc (default 0.115)
  mountingPctOfModule: number;   // % of module cost (structure + labor)
  landCostTotal: number;         // $ total
  omCostPerKwYear: number;       // $/kW/yr
  ppaPricePerMwh: number;        // $/MWh grid sale price
  projectYears: number;          // lifetime
  availabilityPct: number;       // % uptime (default 98)
}

export interface AnnualProjection {
  nameplateKWp: number;
  aepYear1Kwh: number;           // Year-1 AC energy
  capacityFactorPct: number;
  powerDensityWm2: number;       // avg W per m² of LAND
  landAreaM2: number;
  hoursSimulated: number;
}

export interface FinancialResult {
  capexModules: number;
  capexMounting: number;
  capexLand: number;
  capexTotal: number;
  omLifetime: number;
  revenueLifetime: number;
  netProfit: number;
  breakEvenYear: number | null;
  lcoePerMwh: number;
  lifetimeEnergyMwh: number;
  yearlyCumulativeCashflow: number[];
}

/** --------------------------------------------------------------
 *  Validators
 * -------------------------------------------------------------- */
export function isValidLocation(loc: unknown): loc is Location {
  if (typeof loc !== 'object' || loc === null) return false;
  const l = loc as Record<string, unknown>;
  return (
    typeof l.latitude === 'number' && l.latitude >= -90 && l.latitude <= 90 &&
    typeof l.longitude === 'number' && l.longitude >= -180 && l.longitude <= 180 &&
    typeof l.timezone === 'string' && l.timezone.length > 0
  );
}

export function isValidPanelSpec(panel: unknown): panel is PanelSpec {
  if (typeof panel !== 'object' || panel === null) return false;
  const p = panel as Record<string, unknown>;
  return (
    typeof p.pmax === 'number' && p.pmax > 0 &&
    typeof p.efficiencyStc === 'number' && p.efficiencyStc > 0 && p.efficiencyStc <= 0.30 &&
    typeof p.tempCoeffPmax === 'number' && p.tempCoeffPmax >= -1 && p.tempCoeffPmax <= 0 &&
    typeof p.bifaciality === 'number' && p.bifaciality >= 0 && p.bifaciality <= 1 &&
    typeof p.width === 'number' && p.width > 0 &&
    typeof p.height === 'number' && p.height > 0 &&
    typeof p.lid === 'number' && p.lid >= 0 && p.lid <= 0.1 &&
    typeof p.degradationRate === 'number' && p.degradationRate >= 0 && p.degradationRate <= 0.02 &&
    ['TOPCon', 'HJT', 'xBC', 'PERC', 'CdTe', 'Custom'].includes(p.technology as string)
  );
}

export function isValidArrayConfig(array: unknown): array is ArrayConfig {
  if (typeof array !== 'object' || array === null) return false;
  const a = array as Record<string, unknown>;
  return (
    typeof a.tilt === 'number' && a.tilt >= 0 && a.tilt <= 90 &&
    typeof a.azimuth === 'number' && a.azimuth >= 0 && a.azimuth <= 360 &&
    typeof a.gcr === 'number' && a.gcr >= 0.01 && a.gcr <= 0.9 &&
    typeof a.height === 'number' && a.height >= 0 &&
    typeof a.albedo === 'number' && a.albedo >= 0 && a.albedo <= 1 &&
    ['fixed', 'single_axis_horizontal', 'single_axis_tilted', 'dual_axis'].includes(a.tracker as string) &&
    typeof a.dcAcRatio === 'number' && a.dcAcRatio >= 1.0 && a.dcAcRatio <= 2.0 &&
    typeof a.systemLosses === 'number' && a.systemLosses >= 0 && a.systemLosses <= 0.5 &&
    typeof a.moduleCount === 'number' && a.moduleCount >= 1 && Number.isInteger(a.moduleCount)
  );
}

export function isValidWeatherSnapshot(w: unknown): w is WeatherSnapshot {
  if (typeof w !== 'object' || w === null) return false;
  const ws = w as Record<string, unknown>;
  return (
    typeof ws.time === 'number' && ws.time > 0 &&
    typeof ws.tempAir === 'number' && ws.tempAir >= -50 && ws.tempAir <= 60 &&
    typeof ws.dni === 'number' && ws.dni >= 0 && ws.dni <= 1400 &&
    typeof ws.dhi === 'number' && ws.dhi >= 0 && ws.dhi <= 800 &&
    typeof ws.ghi === 'number' && ws.ghi >= 0 && ws.ghi <= 1400 &&
    typeof ws.windSpeed === 'number' && ws.windSpeed >= 0 && ws.windSpeed <= 50 &&
    typeof ws.windDir === 'number' && ws.windDir >= 0 && ws.windDir <= 360 &&
    typeof ws.sunZenith === 'number' && ws.sunZenith >= 0 && ws.sunZenith <= 180 &&
    typeof ws.sunAzimuth === 'number' && ws.sunAzimuth >= 0 && ws.sunAzimuth <= 360
  );
}