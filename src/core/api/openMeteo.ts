// src/core/api/openMeteo.ts
import type { Location, WeatherSnapshot } from '../types';

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

const CURRENT_PARAMS = [
  'temperature_2m',
  'direct_radiation',
  'diffuse_radiation',
  'direct_normal_irradiance',
  'global_tilted_irradiance',
  'shortwave_radiation',
  'wind_speed_10m',
  'wind_direction_10m',
].join(',');

const HOURLY_PARAMS = [
  'temperature_2m',
  'direct_normal_irradiance',
  'diffuse_radiation',
  'shortwave_radiation',
  'wind_speed_10m',
  'wind_direction_10m',
].join(',');

/** --------------------------------------------------------------
 *  Cache + in-flight dedup (prevents 429 rate-limiting)
 *  - Cache: identical requests within 10 min return cached data
 *  - In-flight: simultaneous identical requests share ONE promise
 *    (fixes React StrictMode double-mount firing 2 requests)
 * -------------------------------------------------------------- */
const CACHE_TTL_MS = 10 * 60 * 1000;

const currentCache = new Map<string, { timestamp: number; data: WeatherSnapshot }>();
const currentInFlight = new Map<string, Promise<WeatherSnapshot>>();

/** --------------------------------------------------------------
 *  Type-safe API response interfaces
 * -------------------------------------------------------------- */
interface OpenMeteoCurrentResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    direct_radiation?: number;
    diffuse_radiation?: number;
    direct_normal_irradiance?: number;
    shortwave_radiation?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
}

interface OpenMeteoHourlyResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    direct_normal_irradiance?: number[];
    diffuse_radiation?: number[];
    shortwave_radiation?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
  };
}

/** --------------------------------------------------------------
 *  Safe number extraction with fallback
 * -------------------------------------------------------------- */
function safeNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

/** --------------------------------------------------------------
 *  Fetch with timeout + automatic 429 retry (exponential backoff)
 * -------------------------------------------------------------- */
async function fetchWithTimeout(url: string, timeoutMs = 10000, retries = 1): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 429 && attempt < retries) {
        console.warn('Open-Meteo rate-limited (429). Retrying in 3s…');
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      return res;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }
  throw new Error('fetchWithTimeout: exhausted retries');
}

/** --------------------------------------------------------------
 *  Parse current weather
 *  NOTE: sunZenith/sunAzimuth use 0 as a SENTINEL meaning
 *  "not provided" — SolarMath will compute them via PSA.
 *  (Open-Meteo does not send solar_elevation unless requested,
 *   and requesting it is unreliable — computing it is exact.)
 * -------------------------------------------------------------- */
function parseCurrentWeather(data: OpenMeteoCurrentResponse): WeatherSnapshot {
  const c = data.current;

  if (!c) {
    throw new Error('Invalid API response: missing "current" field');
  }

  return {
    time: safeNumber(
      c.time ? new Date(c.time).getTime() / 1000 : Date.now() / 1000,
      Date.now() / 1000,
      0
    ),
    tempAir: safeNumber(c.temperature_2m, 25, -50, 60),
    dni: safeNumber(c.direct_normal_irradiance ?? c.direct_radiation, 0, 0, 1400),
    dhi: safeNumber(c.diffuse_radiation, 0, 0, 800),
    ghi: safeNumber(c.shortwave_radiation, 0, 0, 1400),
    windSpeed: safeNumber(c.wind_speed_10m, 1, 0, 50),
    windDir: safeNumber(c.wind_direction_10m, 0, 0, 360),
    sunZenith: 0,   // sentinel → SolarMath computes via PSA
    sunAzimuth: 0,  // sentinel → SolarMath computes via PSA
  };
}

/** --------------------------------------------------------------
 *  Parse hourly forecast
 * -------------------------------------------------------------- */
function parseHourlyForecast(data: OpenMeteoHourlyResponse): WeatherSnapshot[] {
  const h = data.hourly;

  if (!h || !Array.isArray(h.time)) {
    throw new Error('Invalid API response: missing or invalid "hourly" field');
  }

  const len = h.time.length;
  const out: WeatherSnapshot[] = [];

  for (let i = 0; i < len; i++) {
    out.push({
      time: safeNumber(
        h.time[i] ? new Date(h.time[i]).getTime() / 1000 : Date.now() / 1000,
        Date.now() / 1000,
        0
      ),
      tempAir: safeNumber(h.temperature_2m?.[i], 25, -50, 60),
      dni: safeNumber(h.direct_normal_irradiance?.[i], 0, 0, 1400),
      dhi: safeNumber(h.diffuse_radiation?.[i], 0, 0, 800),
      ghi: safeNumber(h.shortwave_radiation?.[i], 0, 0, 1400),
      windSpeed: safeNumber(h.wind_speed_10m?.[i], 1, 0, 50),
      windDir: safeNumber(h.wind_direction_10m?.[i], 0, 0, 360),
      sunZenith: 0,
      sunAzimuth: 0,
    });
  }

  return out;
}

/** --------------------------------------------------------------
 *  Public API — cached + deduplicated
 * -------------------------------------------------------------- */
export function fetchCurrentWeather(loc: Location): Promise<WeatherSnapshot> {
  const key = `current_${loc.latitude.toFixed(4)}_${loc.longitude.toFixed(4)}`;

  const cached = currentCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  const existing = currentInFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const url = `${BASE_URL}?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&current=${CURRENT_PARAMS}` +
      `&timezone=${encodeURIComponent(loc.timezone)}`;

    const res = await fetchWithTimeout(url);

    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}: ${res.statusText}`);
    }

    const data: OpenMeteoCurrentResponse = await res.json();
    const parsed = parseCurrentWeather(data);
    currentCache.set(key, { timestamp: Date.now(), data: parsed });
    return parsed;
  })();

  currentInFlight.set(key, promise);
  promise.finally(() => currentInFlight.delete(key));
  return promise;
}

export async function fetchHourlyForecast(loc: Location, hours = 48): Promise<WeatherSnapshot[]> {
  const url = `${BASE_URL}?latitude=${loc.latitude}&longitude=${loc.longitude}` +
    `&hourly=${HOURLY_PARAMS}` +
    `&forecast_hours=${Math.min(Math.max(1, hours), 168)}` +
    `&timezone=${encodeURIComponent(loc.timezone)}`;

  const res = await fetchWithTimeout(url);

  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}: ${res.statusText}`);
  }

  const data: OpenMeteoHourlyResponse = await res.json();
  return parseHourlyForecast(data);
}

/** --------------------------------------------------------------
 *  Solar position algorithm (PSA simplified)
 * -------------------------------------------------------------- */
export function computeSunPosition(
  timestamp: number,
  lat: number,
  lon: number,
  tzOffsetHours: number
): { zenith: number; azimuth: number } {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return { zenith: 90, azimuth: 0 };
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { zenith: 90, azimuth: 0 };
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return { zenith: 90, azimuth: 0 };
  }
  if (!Number.isFinite(tzOffsetHours)) {
    tzOffsetHours = 0;
  }

  const date = new Date(timestamp * 1000);
  const utc = date.getTime() / 1000 - tzOffsetHours * 3600;
  const jd = utc / 86400 + 2440587.5;
  const n = jd - 2451545.0;

  const L = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360 + 360) % 360 * Math.PI / 180;
  const lambda = ((L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360 + 360) % 360 * Math.PI / 180;
  const epsilon = (23.439 - 0.0000004 * n) * Math.PI / 180;

  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda));

  const gmst = ((280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360 + 360) % 360;
  const lst = ((gmst + lon) % 360 + 360) % 360 * Math.PI / 180;
  const ha = lst - ra;

  const latRad = lat * Math.PI / 180;
  const sinAlt = Math.sin(latRad) * Math.sin(dec) + Math.cos(latRad) * Math.cos(dec) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const zenith = 90 - alt * 180 / Math.PI;

  let azimuth = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(latRad) - Math.tan(dec) * Math.cos(latRad));
  azimuth = ((azimuth * 180 / Math.PI) % 360 + 360) % 360;

  return { zenith, azimuth };
}

/** --------------------------------------------------------------
 *  Timezone offset helper
 * -------------------------------------------------------------- */
export function getTimezoneOffset(tz: string): number {
  if (typeof tz !== 'string' || tz.length === 0) return 0;

  const offsets: Record<string, number> = {
    'Asia/Jakarta': 7,
    'UTC': 0,
    'America/Los_Angeles': -8,
    'America/New_York': -5,
    'Europe/Berlin': 1,
    'Europe/London': 0,
    'Asia/Shanghai': 8,
    'Asia/Tokyo': 9,
    'Australia/Sydney': 10,
    'Asia/Singapore': 8,
    'Asia/Dubai': 4,
    'Europe/Paris': 1,
    'America/Chicago': -6,
    'America/Denver': -7,
    'Pacific/Auckland': 12,
  };

  return offsets[tz] ?? 0;
}
/** --------------------------------------------------------------
 *  Historical archive — one full year of hourly data.
 *  Separate endpoint (separate rate limit from forecast API).
 * -------------------------------------------------------------- */
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const archiveCache = new Map<string, { timestamp: number; data: WeatherSnapshot[] }>();

export async function fetchAnnualArchive(loc: Location): Promise<WeatherSnapshot[]> {
  const key = `archive_${loc.latitude.toFixed(3)}_${loc.longitude.toFixed(3)}`;
  const cached = archiveCache.get(key);
  if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) return cached.data; // 1h cache

  const end = new Date();
  end.setDate(end.getDate() - 5); // archive lags ~5 days
  const start = new Date(end);
  start.setFullYear(end.getFullYear() - 1);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `${ARCHIVE_URL}?latitude=${loc.latitude}&longitude=${loc.longitude}` +
    `&start_date=${fmt(start)}&end_date=${fmt(end)}` +
    `&hourly=${HOURLY_PARAMS}` +
    `&timezone=${encodeURIComponent(loc.timezone)}`;

  const res = await fetchWithTimeout(url, 30000);
  if (!res.ok) throw new Error(`Archive HTTP ${res.status}: ${res.statusText}`);

  const data: OpenMeteoHourlyResponse = await res.json();
  const parsed = parseHourlyForecast(data);
  archiveCache.set(key, { timestamp: Date.now(), data: parsed });
  return parsed;
}