// src/data/projectGallery.ts
import type { PanelTechnology } from '../core/types';

export interface GalleryProject {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  technology: PanelTechnology;
  moduleCount: number;
  tilt: number;
  note: string;
}

export const PROJECT_GALLERY: GalleryProject[] = [
  { name: 'Topaz Solar Farm', country: 'USA', latitude: 35.38, longitude: -120.18, timezone: 'America/Los_Angeles', technology: 'CdTe', moduleCount: 100000, tilt: 25, note: '550 MWac CdTe thin-film, California' },
  { name: 'Solar Star', country: 'USA', latitude: 34.83, longitude: -118.40, timezone: 'America/Los_Angeles', technology: 'CdTe', moduleCount: 100000, tilt: 20, note: '579 MWac, single-axis trackers' },
  { name: 'Bhadla Solar Park', country: 'India', latitude: 27.54, longitude: 71.91, timezone: 'Asia/Shanghai', technology: 'PERC', moduleCount: 100000, tilt: 20, note: '2.2 GWac cluster, Rajasthan desert' },
  { name: 'Villanueva', country: 'Mexico', latitude: 28.85, longitude: -101.55, timezone: 'America/Chicago', technology: 'PERC', moduleCount: 100000, tilt: 22, note: '828 MWac, bifacial retrofit studies' },
  { name: 'Longyangxia Dam', country: 'China', latitude: 36.12, longitude: 100.92, timezone: 'Asia/Shanghai', technology: 'PERC', moduleCount: 100000, tilt: 30, note: '850 MWac hydro-solar hybrid' },
  { name: 'Noor Abu Dhabi', country: 'UAE', latitude: 24.35, longitude: 55.35, timezone: 'Asia/Dubai', technology: 'TOPCon', moduleCount: 100000, tilt: 18, note: '1.2 GWac, record-low tariff site' },
];