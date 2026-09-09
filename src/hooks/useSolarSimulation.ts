// src/hooks/useSolarSimulation.ts
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type {
  PanelSpec, ArrayConfig, Location, WeatherSnapshot, SimulationResult,
  FinancialConfig, AnnualProjection, FinancialResult, PanelTechnology,
} from '../core/types';
import { simulateStepSafe } from '../core/SolarMath';
import { fetchCurrentWeather, fetchAnnualArchive } from '../core/api/openMeteo';
import { computeAnnualProjection, computeFinancials } from '../core/FinancialMath';
import { PANEL_PRESETS } from '../core/panelPresets';

const REFETCH_COOLDOWN_MS = 60_000;

const DEFAULT_LOCATION: Location = {
  latitude: -6.2088, longitude: 106.8456, timezone: 'Asia/Jakarta', name: 'Custom Site',
};

const DEFAULT_ARRAY: ArrayConfig = {
  tilt: 15, azimuth: 180, gcr: 0.4, height: 1.0, albedo: 0.2,
  tracker: 'fixed', dcAcRatio: 1.2, systemLosses: 0.14, moduleCount: 100,
};

const DEFAULT_FINANCIAL: FinancialConfig = {
  moduleCostPerW: 0.115, mountingPctOfModule: 110, landCostTotal: 50000,
  omCostPerKwYear: 12, ppaPricePerMwh: 45, projectYears: 30, availabilityPct: 98,
};

function makeFallbackWeather(): WeatherSnapshot {
  return {
    time: Date.now() / 1000, tempAir: 32, dni: 800, dhi: 150, ghi: 900,
    windSpeed: 2.5, windDir: 180, sunZenith: 0, sunAzimuth: 0,
  };
}

export interface SolarSimulation {
  panel: PanelSpec;
  array: ArrayConfig;
  location: Location;
  financial: FinancialConfig;
  weather: WeatherSnapshot;
  result: SimulationResult;
  loading: boolean;
  apiError: string | null;
  usingFallback: boolean;
  cooldownSeconds: number;
  lastUpdated: number | null;
  annual: AnnualProjection | null;
  annualStale: boolean;
  computingAnnual: boolean;
  annualError: string | null;
  financials: FinancialResult | null;
  updatePanel: (patch: Partial<PanelSpec>) => void;
  updateArray: (patch: Partial<ArrayConfig>) => void;
  updateLocation: (patch: Partial<Location>) => void;
  updateFinancial: (patch: Partial<FinancialConfig>) => void;
  applyPreset: (tech: Exclude<PanelTechnology, 'Custom'>) => void;
  refetchWeather: () => void;
  runAnnualProjection: () => void;
}

export function useSolarSimulation(): SolarSimulation {
  const [panel, setPanel] = useState<PanelSpec>(PANEL_PRESETS.TOPCon);
  const [array, setArray] = useState<ArrayConfig>(DEFAULT_ARRAY);
  const [location, setLocation] = useState<Location>(DEFAULT_LOCATION);
  const [financial, setFinancial] = useState<FinancialConfig>(DEFAULT_FINANCIAL);
  const [weather, setWeather] = useState<WeatherSnapshot>(makeFallbackWeather);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [annual, setAnnual] = useState<AnnualProjection | null>(null);
  const [annualSignature, setAnnualSignature] = useState<string>('');
  const [computingAnnual, setComputingAnnual] = useState(false);
  const [annualError, setAnnualError] = useState<string | null>(null);

  const lastFetchRef = useRef<number>(0);

  const doFetch = useCallback(async (loc: Location) => {
    lastFetchRef.current = Date.now();
    setLoading(true);
    setApiError(null);
    try {
      const live = await fetchCurrentWeather(loc);
      setWeather(live);
      setUsingFallback(false);
      setLastUpdated(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown API error';
      setApiError(message);
      setWeather(makeFallbackWeather());
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      lastFetchRef.current = Date.now();
      setLoading(true);
      try {
        const live = await fetchCurrentWeather(DEFAULT_LOCATION);
        if (!cancelled) { setWeather(live); setUsingFallback(false); setLastUpdated(Date.now()); }
      } catch (err) {
        if (!cancelled) {
          setApiError(err instanceof Error ? err.message : 'Unknown API error');
          setWeather(makeFallbackWeather());
          setUsingFallback(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const remaining = Math.max(0, REFETCH_COOLDOWN_MS - (Date.now() - lastFetchRef.current));
      setCooldownSeconds(Math.ceil(remaining / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const refetchWeather = useCallback(() => {
    if (Date.now() - lastFetchRef.current < REFETCH_COOLDOWN_MS) return;
    void doFetch(location);
  }, [doFetch, location]);

  const result = useMemo<SimulationResult>(
    () => simulateStepSafe(panel, array, weather, location),
    [panel, array, weather, location]
  );

  /** Annual projection — user-triggered (heavy API call) */
  const runAnnualProjection = useCallback(async () => {
    setComputingAnnual(true);
    setAnnualError(null);
    try {
      const hourly = await fetchAnnualArchive(location);
      const proj = computeAnnualProjection(panel, array, location, hourly);
      setAnnual(proj);
      setAnnualSignature(JSON.stringify({ panel, array, location }));
    } catch (err) {
      setAnnualError(err instanceof Error ? err.message : 'Annual fetch failed');
    } finally {
      setComputingAnnual(false);
    }
  }, [panel, array, location]);

  const annualStale = annual !== null &&
    annualSignature !== JSON.stringify({ panel, array, location });

  const financials = useMemo<FinancialResult | null>(
    () => (annual ? computeFinancials(panel, array, financial, annual.aepYear1Kwh) : null),
    [annual, panel, array, financial]
  );

  const updatePanel = useCallback((patch: Partial<PanelSpec>) => {
    setPanel(prev => ({ ...prev, ...patch, technology: patch.technology ?? 'Custom' }));
  }, []);

  const updateArray = useCallback((patch: Partial<ArrayConfig>) => {
    setArray(prev => ({ ...prev, ...patch }));
  }, []);

  const updateLocation = useCallback((patch: Partial<Location>) => {
    setLocation(prev => ({ ...prev, ...patch }));
  }, []);

  const updateFinancial = useCallback((patch: Partial<FinancialConfig>) => {
    setFinancial(prev => ({ ...prev, ...patch }));
  }, []);

  const applyPreset = useCallback((tech: Exclude<PanelTechnology, 'Custom'>) => {
    setPanel({ ...PANEL_PRESETS[tech] });
  }, []);

  return {
    panel, array, location, financial, weather, result,
    loading, apiError, usingFallback, cooldownSeconds, lastUpdated,
    annual, annualStale, computingAnnual, annualError, financials,
    updatePanel, updateArray, updateLocation, updateFinancial,
    applyPreset, refetchWeather, runAnnualProjection,
  };
}