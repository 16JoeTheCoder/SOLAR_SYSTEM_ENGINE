// src/core/panelPresets.ts
import type { PanelSpec, PanelTechnology } from './types';

/** --------------------------------------------------------------
 *  Manufacturer-median presets from the technical reference.
 *  Every field remains user-editable after selection.
 * -------------------------------------------------------------- */
export const PANEL_PRESETS: Record<Exclude<PanelTechnology, 'Custom'>, PanelSpec> = {
  TOPCon: {
    technology: 'TOPCon',
    pmax: 580, efficiencyStc: 0.230, tempCoeffPmax: -0.30,
    bifaciality: 0.825, lid: 0.010, degradationRate: 0.0040,
    width: 1.134, height: 2.279,
  },
  HJT: {
    technology: 'HJT',
    pmax: 590, efficiencyStc: 0.235, tempCoeffPmax: -0.25,
    bifaciality: 0.875, lid: 0.000, degradationRate: 0.0028,
    width: 1.134, height: 2.279,
  },
  xBC: {
    technology: 'xBC',
    pmax: 595, efficiencyStc: 0.2375, tempCoeffPmax: -0.29,
    bifaciality: 0.70, lid: 0.010, degradationRate: 0.0038,
    width: 1.134, height: 2.279,
  },
  PERC: {
    technology: 'PERC',
    pmax: 535, efficiencyStc: 0.2125, tempCoeffPmax: -0.36,
    bifaciality: 0.675, lid: 0.025, degradationRate: 0.0063,
    width: 1.134, height: 2.279,
  },
  CdTe: {
    technology: 'CdTe',
    pmax: 455, efficiencyStc: 0.191, tempCoeffPmax: -0.32,
    bifaciality: 0.0, lid: 0.010, degradationRate: 0.0030,
    width: 1.232, height: 2.009,
  },
};

export const PRESET_LIST = Object.keys(PANEL_PRESETS) as Array<Exclude<PanelTechnology, 'Custom'>>;