import LZString from "lz-string";
import type { PlaygroundState } from "./examples";

const HASH_KEY = "s=";
const STORAGE_KEY = "spall-playground:v1";
const SETTINGS_KEY = "spall-playground:settings:v1";

function isState(value: unknown): value is PlaygroundState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.data === "string" && typeof v.doc === "string" && typeof v.set === "string";
}

export function encodeState(state: PlaygroundState): string {
  return HASH_KEY + LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

export function decodeState(hash: string): PlaygroundState | null {
  const body = hash.replace(/^#/, "");
  if (!body.startsWith(HASH_KEY)) return null;
  try {
    const text = LZString.decompressFromEncodedURIComponent(body.slice(HASH_KEY.length));
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    return isState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function shareUrl(state: PlaygroundState): string {
  const url = new URL(location.href);
  url.hash = encodeState(state);
  return url.toString();
}

export function loadSaved(): PlaygroundState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function save(state: PlaygroundState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable, but the playground still works without it.
  }
}

/** Where the Data/Document divider sits, as a percentage of the width (Data's share). */
export const DEFAULT_SPLIT = 100 / 3;
export const MIN_SPLIT = 15;
export const MAX_SPLIT = 65;

export type Settings = { wrap: boolean; live: boolean; split: number };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      const split = typeof parsed.split === "number" ? parsed.split : DEFAULT_SPLIT;
      return {
        wrap: parsed.wrap ?? true,
        live: parsed.live ?? true,
        split: Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, split)),
      };
    }
  } catch {
    // fall through to defaults
  }
  return { wrap: true, live: true, split: DEFAULT_SPLIT };
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable, but the playground still works without it.
  }
}
