// src/components/MapPicker.tsx
import { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's broken default marker icons under Vite
const icon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export interface SiteSelection {
  latitude: number;
  longitude: number;
  elevationM: number | null;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

export default function MapPicker({ onSiteSelect }: {
  onSiteSelect: (site: SiteSelection) => void;
}) {
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const handlePick = async (lat: number, lon: number) => {
    setPos({ lat, lon });
    setBusy(true);
    let elev: number | null = null;
    try {
      // Open-Meteo elevation API — same provider, no key, no extra rate limit bucket
      const res = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
      );
      if (res.ok) {
        const data = await res.json() as { elevation?: number[] };
        elev = data.elevation?.[0] ?? null;
      }
    } catch { elev = null; }
    setElevation(elev);
    setBusy(false);
  };

  return (
    <section className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700/50 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
        🗺️ Site Selector — click anywhere on Earth
      </h2>
      <div className="h-72 w-full rounded-lg overflow-hidden border border-zinc-700">
        <MapContainer center={[20, 0]} zoom={2} scrollWheelZoom className="h-full w-full">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />
          <ClickHandler onPick={handlePick} />
          {pos && <Marker position={[pos.lat, pos.lon]} icon={icon} />}
        </MapContainer>
      </div>
      {pos && (
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-zinc-300">
          <span>📍 {pos.lat.toFixed(4)}°, {pos.lon.toFixed(4)}°</span>
          <span>🏔️ {busy ? '…' : elevation !== null ? `${elevation.toFixed(0)} m` : 'n/a'}</span>
          <button
            onClick={() => onSiteSelect({ latitude: pos.lat, longitude: pos.lon, elevationM: elevation })}
            className="ml-auto py-1.5 px-4 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium"
          >
            ✓ Use This Site
          </button>
        </div>
      )}
    </section>
  );
}