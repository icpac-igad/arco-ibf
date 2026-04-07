import matter from 'gray-matter';
import { serialize } from 'next-mdx-remote/serialize';
import { apiFetch } from './api-fetch';

// API base — Next.js server-side calls; empty = same host (local dev via proxy)
const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

const HAZARD_PREFIX: Record<string, string> = { drought: 'dr', flood: 'fl' };
const STAGE_TO_TAB: Record<string, string> = {
  'risk-knowledge': 'rk',
  'risk-monitoring': 'rm',
  'risk-decisions': 'rd',
};

export interface EventMdxMeta {
  id: string;
  name: string;
  hazard: string;
  tab: string;
  period: string;
  severity: string;
  events?: number;
  countries?: number;
  regions?: number;
}

// ---------------------------------------------------------------------------
// In-memory LRU cache keyed by GCS path → { hash, serialized result }
// Avoids re-fetching + re-serializing on repeated requests within a Cloud Run
// instance lifecycle. Cache is invalidated when the manifest hash changes.
// ---------------------------------------------------------------------------
interface CacheEntry {
  hash: string;
  result: { meta: EventMdxMeta; mdxSource: any };
}
const _cache = new Map<string, CacheEntry>();

// Manifest is refreshed at most once every 5 minutes per instance
let _manifest: Record<string, string> | null = null;
let _manifestFetchedAt = 0;
const MANIFEST_TTL_MS = 5 * 60 * 1000;

async function getManifest(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_manifest && now - _manifestFetchedAt < MANIFEST_TTL_MS) {
    return _manifest;
  }
  try {
    const res = await apiFetch('/api/mdx/manifest', { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json();
      // body.files: { "rk/dr-rk-2021-05.mdx": { hash, updated, size } }
      _manifest = Object.fromEntries(
        Object.entries(body.files ?? {}).map(([k, v]: [string, any]) => [k, v.hash ?? ''])
      );
      _manifestFetchedAt = now;
    }
  } catch {
    // Manifest fetch failed — proceed without cache invalidation
  }
  return _manifest ?? {};
}

/**
 * Build GCS path key: {tab}/{hp}-{tab}-{dateKey}.mdx
 * e.g. ('drought', 'risk-knowledge', '2021-05') → 'rk/dr-rk-2021-05.mdx'
 */
function buildMdxKey(hazard: string, stage: string, dateKey: string): string {
  const hp = HAZARD_PREFIX[hazard] ?? hazard.slice(0, 2);
  const tab = STAGE_TO_TAB[stage] ?? 'rk';
  return `${tab}/${hp}-${tab}-${dateKey}.mdx`;
}

/**
 * Fetch raw MDX text from crma-api.
 * Path: GET /api/mdx/raw/{tab}/{filename}
 */
async function fetchRaw(key: string): Promise<string | null> {
  const [tab, filename] = key.split('/');
  try {
    const res = await apiFetch(`/api/mdx/raw/${tab}/${filename}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function serializeRaw(raw: string) {
  const { data, content } = matter(raw);
  const mdxSource = await serialize(content, { parseFrontmatter: false });
  return { meta: data as EventMdxMeta, mdxSource };
}

/**
 * Load and serialize event MDX by hazard, stage, and date key.
 * Fetches raw MDX from crma-api → serializes via next-mdx-remote → caches.
 */
export async function loadEventMdx(hazard: string, stage: string, dateKey: string) {
  const key = buildMdxKey(hazard, stage, dateKey);

  // Check manifest for current hash
  const manifest = await getManifest();
  const currentHash = manifest[key] ?? null;

  // Cache hit — same hash
  const cached = _cache.get(key);
  if (cached && currentHash && cached.hash === currentHash) {
    return cached.result;
  }

  // Fetch raw MDX from API
  let raw = await fetchRaw(key);

  // Fallback: for daily keys (YYYY-MM-DD), try month-level (YYYY-MM)
  if (!raw && dateKey.length === 10) {
    const monthKey = buildMdxKey(hazard, stage, dateKey.slice(0, 7));
    const monthHash = manifest[monthKey] ?? null;
    const monthCached = _cache.get(monthKey);
    if (monthCached && monthHash && monthCached.hash === monthHash) {
      return monthCached.result;
    }
    raw = await fetchRaw(monthKey);
    if (raw) {
      const result = await serializeRaw(raw);
      _cache.set(monthKey, { hash: monthHash ?? '', result });
      return result;
    }
  }

  if (!raw) return null;

  const result = await serializeRaw(raw);
  _cache.set(key, { hash: currentHash ?? '', result });
  return result;
}
