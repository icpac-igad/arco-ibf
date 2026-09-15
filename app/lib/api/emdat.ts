import { API_BASE_URL } from 'app/config';
import type {
  DisasterType,
  EmdatMonthDatum,
  EmdatRegionDatum,
  IbfCalendarDatum,
} from 'app/types/emdat';
import type {
  CrmaMrCalendarResponse,
  CrmaMrDagResponse,
  CrmaMrMarkdownResponse,
  CrmaMrRegion,
  CrmaMrRegionsResponse,
  CrmaMrSeason,
  CrmaMrWindow,
} from 'app/types/crma-mr';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: 'no-store',
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${path}`);
  }

  return response.json();
}

export async function fetchEmdatMonthlyRisk(
  disasterType: DisasterType,
): Promise<EmdatMonthDatum[]> {
  const payload = await request<{ data?: EmdatMonthDatum[] }>(
    `/api/emdat-monthly-risk?type=${disasterType}`,
  );

  return payload.data ?? [];
}

export async function fetchEmdatMonthRegions(
  eventKey: string,
): Promise<EmdatRegionDatum[]> {
  const payload = await request<{ regions?: EmdatRegionDatum[] }>(
    `/api/emdat-month-regions/${eventKey}`,
  );

  return payload.regions ?? [];
}

// Optional `country` (GID prefix, e.g. "KEN") aggregates counts to that country's
// admin-1s server-side — one request instead of one per period.
export async function fetchIbfFloodCalendar(country?: string): Promise<IbfCalendarDatum[]> {
  const q = country ? `?country=${encodeURIComponent(country)}` : '';
  const payload = await request<{ data?: IbfCalendarDatum[] }>(`/api/ibf-flood-calendar${q}`);
  return payload.data ?? [];
}

export async function fetchIbfDroughtCalendar(country?: string): Promise<IbfCalendarDatum[]> {
  const q = country ? `?country=${encodeURIComponent(country)}` : '';
  const payload = await request<{ data?: IbfCalendarDatum[] }>(`/api/ibf-drought-calendar${q}`);
  return payload.data ?? [];
}

export async function fetchIbfFloodRegions(
  date: string,
): Promise<EmdatRegionDatum[]> {
  const payload = await request<{ regions?: EmdatRegionDatum[] }>(
    `/api/ibf-flood-regions/${date}`,
  );
  return payload.regions ?? [];
}

export async function fetchBnDag(
  date: string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/bn-dag/${date}`);
}

// ── Drought IBF (init-month is YYYY-MM) ───────────────────────────────────

export async function fetchIbfDroughtRegions(
  init: string,
): Promise<EmdatRegionDatum[]> {
  const payload = await request<{ regions?: EmdatRegionDatum[] }>(
    `/api/ibf-drought-regions/${init}`,
  );
  return payload.regions ?? [];
}

export async function fetchDroughtBnDag(
  init: string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/drought-bn-dag/${init}`);
}

export async function fetchEmdatEventMarkdown(
  eventKey: string,
): Promise<{ markdown: string; event_key: string } | null> {
  try {
    const payload = await request<{ markdown: string; event_key: string }>(
      `/api/emdat-event-markdown/${eventKey}`,
    );
    return payload;
  } catch (error) {
    console.warn('Markdown unavailable for event', eventKey, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Medium-range CRMA — the six-node network, MAM/JJA 2026
//
// Keyed (init, window) throughout. A date carries five answers at five lead
// windows, so there is no fetcher here that takes a date alone: one would have
// to pick a lead silently and hide the other four.
// ---------------------------------------------------------------------------

export async function fetchCrmaMrCalendar(
  opts: { season?: CrmaMrSeason; window?: CrmaMrWindow } = {},
): Promise<CrmaMrCalendarResponse> {
  const qs = new URLSearchParams();
  if (opts.season) qs.set('season', opts.season);
  if (opts.window) qs.set('window', opts.window);
  const query = qs.toString();
  return request<CrmaMrCalendarResponse>(
    `/api/crma-mr-calendar${query ? `?${query}` : ''}`,
  );
}

export async function fetchCrmaMrRegions(
  init: string,
  window: CrmaMrWindow,
): Promise<CrmaMrRegion[]> {
  const payload = await request<CrmaMrRegionsResponse>(
    `/api/crma-mr-regions/${init}/${encodeURIComponent(window)}`,
  );
  return payload.regions ?? [];
}

export async function fetchCrmaMrBasins(
  init: string,
  window: CrmaMrWindow,
): Promise<Record<string, unknown>[]> {
  const payload = await request<{ basins?: Record<string, unknown>[] }>(
    `/api/crma-mr-basin/${init}/${encodeURIComponent(window)}`,
  );
  return payload.basins ?? [];
}

/**
 * The whole network for one initialisation — 55 basins x 5 windows, the
 * 227-unit admin-1 index, and the topology itself.
 *
 * One fetch serves all five windows and both geographies, so the window
 * selector switches within a loaded DAG rather than refetching. ~960 KB raw,
 * ~58 KB over the wire (the API gzips it). Cache it per `init`, the way
 * BoundaryDagPanel caches bn-dag per date.
 */
export async function fetchCrmaMrDag(init: string): Promise<CrmaMrDagResponse> {
  return request<CrmaMrDagResponse>(`/api/crma-mr-dag/${init}`);
}

export async function fetchCrmaMrBrief(
  init: string,
  kind: 'brief' | 'synoptic' = 'brief',
): Promise<CrmaMrMarkdownResponse | null> {
  try {
    return await request<CrmaMrMarkdownResponse>(`/api/crma-mr-${kind}/${init}`);
  } catch (error) {
    console.warn(`CRMA ${kind} unavailable for`, init, error);
    return null;
  }
}
