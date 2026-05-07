import { API_BASE_URL } from 'app/config';
import type {
  DisasterType,
  EmdatMonthDatum,
  EmdatRegionDatum,
} from 'app/types/emdat';

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
