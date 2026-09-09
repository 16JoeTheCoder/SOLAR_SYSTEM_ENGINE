// src/engine/annualYield.ts
/** --------------------------------------------------------------
 *  ANNUAL YIELD ENGINE — 8,760h simulation
 *  Primary source: Open-Meteo historical archive (CORS-friendly)
 *  Fallback: PVGIS v5.2 TMY (EC JRC)
 *  Physics: existing SolarMath kernel (Perez POA, Faiman thermal,
 *  inverter clipping). P90 = P50·(1−1.282σ), P99 = P50·(1−2.326σ).
 * -------------------------------------------------------------- */
import type { PanelSpec, ArrayConfig, Location, WeatherSnapshot } from '../core/types';
import { simulateStepSafe } from '../core/SolarMath';
import { fetchAnnualArchive } from '../core/api/openMeteo';
export interface AnnualYieldResult {
  annualAcMWh: number;
  annualDcMWh: number;
  capacityFactorPct: number;
  specificYieldKwhPerKwp: number;
  monthlyAcMWh: number[];
  p50MWh: number;
  p90MWh: number;
  p99MWh: number;
  lifetimeAcMWh25yr: number;
  hoursSimulated: number;
  source: string;
}

interface PvgisRow {
  'time(UTC)'?: string;
  'G(h)'?: number; 'Gb(n)'?: number; 'Gd(h)'?: number;
  'T2m'?: number; 'WS10m'?: number;
}

type TmyTuple = [number, number, number, number, number, number];

function cacheKey(loc: Location): string {
  return `tmy_${loc.latitude.toFixed(2)}_${loc.longitude.toFixed(2)}`;
}

function tuplesToSnapshots(t: TmyTuple[]): WeatherSnapshot[] {
  return t.map(([time, ghi, dni, dhi, tempAir, windSpeed]) => ({
    time, ghi, dni, dhi, tempAir, windSpeed, windDir: 0, sunZenith: 0, sunAzimuth: 0,
  }));
}

function snapshotsToTuples(s: WeatherSnapshot[]): TmyTuple[] {
  return s.map(w => [w.time, w.ghi, w.dni, w.dhi, w.tempAir, w.windSpeed]);
}

async function fetchFromPVGIS(loc: Location): Promise<WeatherSnapshot[]> {
  const url = `https://re.jrc.ec.europa.eu/api/v5_2/tmy?lat=${loc.latitude}&lon=${loc.longitude}&outputformat=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PVGIS HTTP ${res.status}`);
  const data = await res.json() as { outputs?: { tmy_hourly?: PvgisRow[] } };
  const rows = data.outputs?.tmy_hourly;
  if (!rows || rows.length < 8000) throw new Error('PVGIS returned incomplete TMY');
  return rows.map((r) => {
    const t = r['time(UTC)'] ?? '20050101:0010';
    return {
      time: Date.UTC(Number(t.slice(0, 4)), Number(t.slice(4, 6)) - 1, Number(t.slice(6, 8)), Number(t.slice(9, 11))) / 1000,
      ghi: Math.max(0, r['G(h)'] ?? 0),
      dni: Math.max(0, r['Gb(n)'] ?? 0),
      dhi: Math.max(0, r['Gd(h)'] ?? 0),
      tempAir: r['T2m'] ?? 25,
      windSpeed: Math.max(0, r['WS10m'] ?? 1),
      windDir: 0, sunZenith: 0, sunAzimuth: 0,
    };
  });
}

/** Fetch 8,760 hourly records: cache → Open-Meteo archive → PVGIS */
export async function fetchTMY(loc: Location): Promise<{ data: WeatherSnapshot[]; source: string }> {
  const key = cacheKey(loc);
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const tuples = JSON.parse(cached) as TmyTuple[];
      if (Array.isArray(tuples) && tuples.length >= 8000) {
        return { data: tuplesToSnapshots(tuples), source: 'browser cache' };
      }
    }
  } catch { /* corrupted cache → refetch */ }

  // AFTER (PVGIS first — satellite-derived SARAH-3, bankability standard;
  // Open-Meteo ERA5 archive as fallback for reliability)
  try {
    const data = await fetchFromPVGIS(loc);
    try { localStorage.setItem(key, JSON.stringify(snapshotsToTuples(data))); } catch { /* quota */ }
    return { data, source: 'PVGIS TMY (EC JRC)' };
  } catch {
    const data = await fetchAnnualArchive(loc);
    try { localStorage.setItem(key, JSON.stringify(snapshotsToTuples(data))); } catch { /* quota */ }
    return { data, source: 'Open-Meteo historical archive' };
  }
}

export function runAnnualSimulation(
  panel: PanelSpec,
  array: ArrayConfig,
  location: Location,
  tmy: WeatherSnapshot[],
  sigmaTotal = 0.05,
  source = 'Open-Meteo historical archive'
): AnnualYieldResult {
  const monthlyAcMWh = new Array<number>(12).fill(0);
  let acWh = 0, dcWh = 0;

  for (const w of tmy) {
    const r = simulateStepSafe(panel, array, w, location);
    acWh += r.acPower;
    dcWh += r.dcPower;
    monthlyAcMWh[new Date(w.time * 1000).getUTCMonth()] += r.acPower / 1e6;
  }

  const hours = Math.max(tmy.length, 1);
  const annualAcMWh = acWh / 1e6;
  const nameplateKWp = (panel.pmax * array.moduleCount) / 1000;
  const capacityFactorPct = nameplateKWp > 0 ? (acWh / 1000) / (nameplateKWp * hours) * 100 : 0;
  const specificYieldKwhPerKwp = nameplateKWp > 0 ? (acWh / 1000) / nameplateKWp : 0;

  const p50MWh = annualAcMWh;
  const p90MWh = annualAcMWh * (1 - 1.282 * sigmaTotal);
  const p99MWh = annualAcMWh * (1 - 2.326 * sigmaTotal);

  let lifetimeAcMWh25yr = 0;
  for (let y = 1; y <= 25; y++) {
    lifetimeAcMWh25yr += p50MWh * (1 - panel.lid) * Math.max(0, 1 - panel.degradationRate * (y - 1));
  }

  return {
    annualAcMWh, annualDcMWh: dcWh / 1e6, capacityFactorPct, specificYieldKwhPerKwp,
    monthlyAcMWh, p50MWh, p90MWh, p99MWh, lifetimeAcMWh25yr,
    hoursSimulated: hours, source,
  };
}