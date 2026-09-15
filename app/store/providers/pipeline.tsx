'use client';

import React, {
  createContext,
  useContext,
  useMemo,
  useReducer,
  useEffect,
  ReactNode,
} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { DisasterType } from 'app/types/emdat';
import type { PipelineStage, PipelineState } from 'app/types/pipeline';
import { CRMA_MR_WINDOWS, type CrmaMrWindow } from 'app/types/crma-mr';

const VALID_STAGES: PipelineStage[] = ['risk-knowledge', 'risk-monitoring', 'risk-decisions'];

interface PipelineContextType extends PipelineState {
  setHazard: (hazard: DisasterType) => void;
  setStage: (stage: PipelineStage) => void;
  setSelectedMonth: (month: string | null) => void;
  setSelectedEventKey: (eventKey: string | null) => void;
  setSelectedBoundary: (boundaryId: string | null) => void;
  setSelectedWindow: (window: CrmaMrWindow) => void;
}

const defaultState: PipelineState = {
  hazard: 'drought',
  stage: 'risk-knowledge',
  selectedMonth: null,
  selectedEventKey: null,
  selectedBoundary: null,
  // D1 rather than null: every medium-range row is keyed (init, window), so
  // there is no "no window" state to fall back to — a null would mean the map
  // and the DAG panel had nothing to ask for.
  selectedWindow: 'D1',
};

const PipelineContext = createContext<PipelineContextType>({
  ...defaultState,
  setHazard: () => undefined,
  setStage: () => undefined,
  setSelectedMonth: () => undefined,
  setSelectedEventKey: () => undefined,
  setSelectedBoundary: () => undefined,
  setSelectedWindow: () => undefined,
});

type Action =
  | { type: 'setHazard'; payload: DisasterType }
  | { type: 'setStage'; payload: PipelineStage }
  | { type: 'setSelectedMonth'; payload: string | null }
  | { type: 'setSelectedEventKey'; payload: string | null }
  | { type: 'setSelectedBoundary'; payload: string | null }
  | { type: 'setSelectedWindow'; payload: CrmaMrWindow }
  | { type: 'syncFromUrl'; payload: Partial<PipelineState> };

function reducer(state: PipelineState, action: Action): PipelineState {
  switch (action.type) {
    case 'setHazard':
      // Spread rather than rebuild. The previous form listed the fields to keep
      // and so silently dropped `selectedBoundary` on every hazard switch; a
      // rebuild also loses each field added later, which `selectedWindow` would
      // have been. Clearing is now explicit and the list is the exception.
      return {
        ...state,
        hazard: action.payload,
        selectedMonth: null,
        selectedEventKey: null,
      };
    case 'setStage':
      return { ...state, stage: action.payload, selectedMonth: null, selectedEventKey: null };
    case 'setSelectedMonth':
      return { ...state, selectedMonth: action.payload };
    case 'setSelectedEventKey':
      return { ...state, selectedEventKey: action.payload };
    case 'setSelectedBoundary':
      return { ...state, selectedBoundary: action.payload };
    case 'setSelectedWindow':
      return { ...state, selectedWindow: action.payload };
    case 'syncFromUrl':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

/**
 * Build shareable URL.
 * Monthly modes use ?month=YYYY-MM, daily modes use ?date=YYYY-MM-DD.
 * For simplicity we include both if present — the one that matches wins on restore.
 */
function buildUrl(
  hazard: DisasterType,
  stage: PipelineStage,
  selectedMonth?: string | null,
  selectedEventKey?: string | null,
  selectedWindow?: CrmaMrWindow | null,
) {
  const params = new URLSearchParams();
  params.set('hazard', hazard);
  params.set('stage', stage);
  if (selectedMonth) {
    // YYYY-MM-DD → ?date=, YYYY-MM → ?month=
    if (selectedMonth.length === 10) {
      params.set('date', selectedMonth);
    } else {
      params.set('month', selectedMonth);
    }
  }
  // Event key (only meaningful at risk-knowledge) wins over month for MDX lookup.
  if (selectedEventKey && stage === 'risk-knowledge') {
    params.set('event', selectedEventKey);
  }
  // Lead window travels in the URL only where it means something: the
  // medium-range feed is flood risk-monitoring, and elsewhere a ?window= would
  // be a parameter the page ignores, which is worse than absent.
  if (selectedWindow && hazard === 'flood' && stage === 'risk-monitoring') {
    params.set('window', selectedWindow);
  }
  return `/?${params.toString()}`;
}

export function PipelineProvider({
  children,
  syncUrl = true,
}: {
  children: ReactNode;
  // When false, the provider is pure state — setters do not push to the URL and
  // the FROM-URL effect is skipped. Used by Scenario Mode (`/scenario/[eventId]`),
  // which drives the store programmatically and must not navigate back to `/`.
  syncUrl?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(reducer, defaultState);

  // Sync FROM URL
  useEffect(() => {
    if (!syncUrl) return;
    const hazard = searchParams.get('hazard') as DisasterType | null;
    const stage = searchParams.get('stage') as PipelineStage | null;
    const month = searchParams.get('month');   // YYYY-MM
    const date = searchParams.get('date');     // YYYY-MM-DD
    const event = searchParams.get('event');   // EM-DAT Dis No like "1990-9289-SDN"
    const window = searchParams.get('window'); // D1 | D2-3 | D4-5 | D6-7 | D8-10

    const updates: Partial<PipelineState> = {};
    if (hazard === 'drought' || hazard === 'flood') {
      updates.hazard = hazard;
    }
    if (stage && VALID_STAGES.includes(stage)) {
      updates.stage = stage;
    }
    // Restore selectedMonth from either ?month= or ?date=
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      updates.selectedMonth = date;
    } else if (month && /^\d{4}-\d{2}$/.test(month)) {
      updates.selectedMonth = month;
    }
    // Event key only honored at risk-knowledge.
    if (event && (stage ?? defaultState.stage) === 'risk-knowledge') {
      updates.selectedEventKey = event;
    } else if (!event) {
      updates.selectedEventKey = null;
    }
    // Validated against the list, not a pattern: "D3-4" looks plausible and
    // does not exist, and the API rejects it. An invalid value is ignored so
    // the deep link still opens, on the default window.
    if (window && (CRMA_MR_WINDOWS as readonly string[]).includes(window)) {
      updates.selectedWindow = window as CrmaMrWindow;
    }

    if (Object.keys(updates).length > 0) {
      dispatch({ type: 'syncFromUrl', payload: updates });
    }
  }, [searchParams]);

  // Push TO URL
  const updateUrl = (
    hazard: DisasterType,
    stage: PipelineStage,
    selectedMonth?: string | null,
    selectedEventKey?: string | null,
    selectedWindow?: CrmaMrWindow | null,
  ) => {
    if (!syncUrl) return;
    router.replace(
      buildUrl(hazard, stage, selectedMonth, selectedEventKey, selectedWindow),
      { scroll: false },
    );
  };

  const value = useMemo(
    () => ({
      ...state,
      setHazard: (hazard: DisasterType) => {
        dispatch({ type: 'setHazard', payload: hazard });
        updateUrl(hazard, state.stage, null, null, state.selectedWindow);
      },
      setStage: (stage: PipelineStage) => {
        dispatch({ type: 'setStage', payload: stage });
        updateUrl(state.hazard, stage, null, null, state.selectedWindow);
      },
      setSelectedMonth: (month: string | null) => {
        dispatch({ type: 'setSelectedMonth', payload: month });
        // Selecting a different month clears the event so the list re-shows.
        updateUrl(state.hazard, state.stage, month, null, state.selectedWindow);
      },
      setSelectedEventKey: (eventKey: string | null) => {
        dispatch({ type: 'setSelectedEventKey', payload: eventKey });
        updateUrl(state.hazard, state.stage, state.selectedMonth, eventKey, state.selectedWindow);
      },
      setSelectedBoundary: (boundaryId: string | null) =>
        dispatch({ type: 'setSelectedBoundary', payload: boundaryId }),
      setSelectedWindow: (window: CrmaMrWindow) => {
        dispatch({ type: 'setSelectedWindow', payload: window });
        updateUrl(state.hazard, state.stage, state.selectedMonth, state.selectedEventKey, window);
      },
    }),
    [state, router],
  );

  return (
    <PipelineContext.Provider value={value}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipelineStore() {
  return useContext(PipelineContext);
}
