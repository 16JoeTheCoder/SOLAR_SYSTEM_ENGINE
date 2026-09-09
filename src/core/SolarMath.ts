// src/core/SolarMath.ts
import type { PanelSpec, ArrayConfig, WeatherSnapshot, SimulationResult, Location } from './types';
import { computeSunPosition, getTimezoneOffset } from './api/openMeteo';

/** --------------------------------------------------------------
 *  Constants
 * -------------------------------------------------------------- */
const STC_IRR = 1000;
const STC_TEMP = 25;
const FAIMAN_U0 = 25.0;
const FAIMAN_U1 = 6.84;

/** --------------------------------------------------------------
 *  Helpers
 * -------------------------------------------------------------- */
function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function rearViewFactor(gcr: number, tilt: number, height: number): number {
  const gcrC = clamp(gcr, 0.01, 0.9);
  const tiltC = clamp(tilt, 0, 90);
  const hC = clamp(height, 0, 10);
  const base = (1 - gcrC) * (1 - Math.cos(tiltC * Math.PI / 180)) / 2;
  const heightFactor = Math.min(1, hC / 0.5);
  return base * heightFactor;
}

function perezDiffusePOA(
  dhi: number, dni: number, ghi: number,
  tilt: number, sunZenith: number, sunAzimuth: number, arrayAzimuth: number
): number {
  if (ghi <= 0 || dhi <= 0) return 0;
  const tiltRad = clamp(tilt, 0, 90) * Math.PI / 180;
  const zenRad = clamp(sunZenith, 0, 180) * Math.PI / 180;
  const azDiff = (sunAzimuth - arrayAzimuth) * Math.PI / 180;

  const cosTheta = Math.cos(zenRad) * Math.cos(tiltRad) +
    Math.sin(zenRad) * Math.sin(tiltRad) * Math.cos(azDiff);
  const cosZenith = Math.cos(zenRad);

  const a = Math.max(0, cosTheta);
  const b = Math.max(0.087, cosZenith);
  const dniSafe = Math.max(dni, 1e-6);
  const ghiSafe = Math.max(ghi, 1e-6);

  const F1 = Math.max(0, 1 - Math.pow(ghi / dniSafe, 2));
  const F2 = Math.sqrt(dni / ghiSafe);

  const isotropic = dhi * (1 + Math.cos(tiltRad)) / 2;
  const circumsolar = dhi * F1 * a / b;
  const horizon = dhi * F2 * Math.sin(tiltRad);

  return isotropic + circumsolar + horizon;
}

/** --------------------------------------------------------------
 *  Main simulation step
 * -------------------------------------------------------------- */
export function simulateStep(
  panel: PanelSpec,
  array: ArrayConfig,
  weather: WeatherSnapshot,
  location: Location
): SimulationResult {
  // 1. Sun position
  const { zenith: sunZenith, azimuth: sunAzimuth } = weather.sunZenith > 0
    ? { zenith: weather.sunZenith, azimuth: weather.sunAzimuth }
    : computeSunPosition(
        weather.time,
        location.latitude,
        location.longitude,
        getTimezoneOffset(location.timezone)
      );

  // 2. Angle of incidence
  const tiltRad = clamp(array.tilt, 0, 90) * Math.PI / 180;
  const arrayAzRad = clamp(array.azimuth, 0, 360) * Math.PI / 180;
  const sunZenRad = clamp(sunZenith, 0, 180) * Math.PI / 180;
  const sunAzRad = clamp(sunAzimuth, 0, 360) * Math.PI / 180;

  const cosTheta = Math.cos(sunZenRad) * Math.cos(tiltRad) +
    Math.sin(sunZenRad) * Math.sin(tiltRad) * Math.cos(sunAzRad - arrayAzRad);
  const aoI = Math.acos(Math.max(-1, Math.min(1, cosTheta))) * 180 / Math.PI;

  // 3. Front POA
  const beamFront = weather.dni * Math.max(0, cosTheta);
  const diffuseFront = perezDiffusePOA(
    weather.dhi, weather.dni, weather.ghi,
    array.tilt, sunZenith, sunAzimuth, array.azimuth
  );
  const groundReflectedFront = weather.ghi * clamp(array.albedo, 0, 1) * (1 - Math.cos(tiltRad)) / 2;
  const poaFront = Math.max(0, beamFront + diffuseFront + groundReflectedFront);

  // 4. Rear POA
  const vf = rearViewFactor(array.gcr, array.tilt, array.height);
  const groundReflectedRear = weather.ghi * clamp(array.albedo, 0, 1) * vf;
  const diffuseRear = weather.dhi * vf;
  const poaRear = Math.max(0, groundReflectedRear + diffuseRear);

  // 5. Effective irradiance
  const poaEffective = Math.max(0, poaFront + poaRear * clamp(panel.bifaciality, 0, 1));

  // 6. Cell temperature (Faiman)
  const u = FAIMAN_U0 + FAIMAN_U1 * clamp(weather.windSpeed, 0, 50);
  const cellTemp = weather.tempAir + poaEffective / Math.max(u, 1);

  // 7. Temperature-derated efficiency
  const efficiency = clamp(
    panel.efficiencyStc * (1 + clamp(panel.tempCoeffPmax, -1, 0) / 100 * (cellTemp - STC_TEMP)),
    0.01, 0.35
  );

  // 8. DC power
  const dcPower = Math.max(0, poaEffective * efficiency * panel.width * panel.height * array.moduleCount);

  // 9. Inverter clipping + losses
  const acCapacity = dcPower / clamp(array.dcAcRatio, 1.0, 2.0);
  const acPower = Math.max(0, Math.min(dcPower * (1 - clamp(array.systemLosses, 0, 0.5)), acCapacity));

  // 10. Performance metrics
  const pmaxTotal = panel.pmax * array.moduleCount;
  const specificYield = pmaxTotal > 0 ? (acPower / 1000) / (pmaxTotal / 1000) : 0;
  const performanceRatio = poaEffective > 0
    ? clamp((acPower / pmaxTotal) * (STC_IRR / poaEffective) * 100, 0, 100)
    : 0;

  return {
    poaFront,
    poaRear,
    poaEffective,
    cellTemp,
    efficiency,
    dcPower,
    acPower,
    specificYield,
    performanceRatio,
    aoI,
  };
}

/** Safe wrapper — never throws */
export function simulateStepSafe(
  panel: PanelSpec,
  array: ArrayConfig,
  weather: WeatherSnapshot,
  location: Location
): SimulationResult {
  try {
    return simulateStep(panel, array, weather, location);
  } catch (e) {
    console.error('Simulation error:', e);
    return {
      poaFront: 0, poaRear: 0, poaEffective: 0,
      cellTemp: weather.tempAir ?? 25,
      efficiency: panel.efficiencyStc ?? 0.20,
      dcPower: 0, acPower: 0,
      specificYield: 0, performanceRatio: 0,
      aoI: 90,
    };
  }
}