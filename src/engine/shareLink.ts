// src/engine/shareLink.ts
/** Zero-backend state sharing via URL hash (base64url-encoded JSON). */
import type { PanelSpec, ArrayConfig, Location, FinancialConfig } from '../core/types';

export interface ShareState {
  panel: PanelSpec;
  array: ArrayConfig;
  location: Location;
  financial: FinancialConfig;
}

export function encodeState(s: ShareState): string {
  const json = JSON.stringify(s);
  return btoa(unescape(encodeURIComponent(json)))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeState(hash: string): ShareState | null {
  try {
    const b64 = hash.replace(/^#/, '').replaceAll('-', '+').replaceAll('_', '/');
    const obj = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (obj && obj.panel && obj.array && obj.location && obj.financial) return obj as ShareState;
    return null;
  } catch {
    return null;
  }
}