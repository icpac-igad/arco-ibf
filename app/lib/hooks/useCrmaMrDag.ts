'use client';

import { useEffect, useState } from 'react';
import { fetchCrmaMrDag } from 'app/lib/api/emdat';
import type { CrmaMrDagResponse } from 'app/types/crma-mr';

/**
 * The medium-range DAG for one initialisation, shared by every component that
 * needs it.
 *
 * One payload carries all five lead windows and both geographies (~58 KB
 * gzipped), so the region panel and the five lead-window maps read the SAME
 * response: a module-level promise cache keyed by init means simultaneous
 * mounts join one in-flight request instead of each issuing their own.
 *
 * A failed request is evicted so the next mount (or the next pick of the same
 * date) retries. The cache is capped: each entry is ~1 MB parsed, and a
 * facilitator clicking through a season would otherwise keep them all.
 */
const MAX_ENTRIES = 6;
const pending = new Map<string, Promise<CrmaMrDagResponse>>();
const loaded = new Map<string, CrmaMrDagResponse>();

function remember(init: string, data: CrmaMrDagResponse) {
  loaded.delete(init);
  loaded.set(init, data);
  while (loaded.size > MAX_ENTRIES) {
    const oldest = loaded.keys().next().value as string;
    loaded.delete(oldest);
    pending.delete(oldest);
  }
}

export function loadCrmaMrDag(init: string): Promise<CrmaMrDagResponse> {
  let p = pending.get(init);
  if (!p) {
    p = fetchCrmaMrDag(init).then((data) => {
      remember(init, data);
      return data;
    });
    p.catch(() => {
      if (pending.get(init) === p) pending.delete(init);
    });
    pending.set(init, p);
  }
  return p;
}

type State = { init: string | null; data: CrmaMrDagResponse | null; error: boolean };

export function useCrmaMrDag(init: string | null): {
  data: CrmaMrDagResponse | null;
  loading: boolean;
  error: boolean;
} {
  const [state, setState] = useState<State>(() => ({
    init,
    data: init ? loaded.get(init) ?? null : null,
    error: false,
  }));

  useEffect(() => {
    if (!init) return;
    const hit = loaded.get(init);
    if (hit) {
      setState({ init, data: hit, error: false });
      return;
    }
    let cancelled = false;
    setState({ init, data: null, error: false });
    loadCrmaMrDag(init)
      .then((data) => { if (!cancelled) setState({ init, data, error: false }); })
      .catch((err) => {
        console.error('CRMA MR DAG fetch error', err);
        if (!cancelled) setState({ init, data: null, error: true });
      });
    return () => { cancelled = true; };
  }, [init]);

  // Never hand back another init's payload while the new one loads.
  const current = state.init === init;
  const data = !init ? null : current && state.data ? state.data : loaded.get(init) ?? null;
  const error = !!init && current && state.error && !data;
  return { data, loading: !!init && !data && !error, error };
}
