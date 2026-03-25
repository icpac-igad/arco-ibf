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

const VALID_STAGES: PipelineStage[] = ['risk-knowledge', 'risk-monitoring', 'decision-support'];

interface PipelineContextType extends PipelineState {
  setHazard: (hazard: DisasterType) => void;
  setStage: (stage: PipelineStage) => void;
  setSelectedMonth: (month: string | null) => void;
  setSelectedEventKey: (eventKey: string | null) => void;
}

const defaultState: PipelineState = {
  hazard: 'drought',
  stage: 'risk-knowledge',
  selectedMonth: null,
  selectedEventKey: null,
};

const PipelineContext = createContext<PipelineContextType>({
  ...defaultState,
  setHazard: () => undefined,
  setStage: () => undefined,
  setSelectedMonth: () => undefined,
  setSelectedEventKey: () => undefined,
});

type Action =
  | { type: 'setHazard'; payload: DisasterType }
  | { type: 'setStage'; payload: PipelineStage }
  | { type: 'setSelectedMonth'; payload: string | null }
  | { type: 'setSelectedEventKey'; payload: string | null }
  | { type: 'syncFromUrl'; payload: Partial<PipelineState> };

function reducer(state: PipelineState, action: Action): PipelineState {
  switch (action.type) {
    case 'setHazard':
      return {
        hazard: action.payload,
        stage: state.stage,
        selectedMonth: null,
        selectedEventKey: null,
      };
    case 'setStage':
      return { ...state, stage: action.payload, selectedMonth: null, selectedEventKey: null };
    case 'setSelectedMonth':
      return { ...state, selectedMonth: action.payload };
    case 'setSelectedEventKey':
      return { ...state, selectedEventKey: action.payload };
    case 'syncFromUrl':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

export function PipelineProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(reducer, defaultState);

  useEffect(() => {
    const hazard = searchParams.get('hazard') as DisasterType | null;
    const stage = searchParams.get('stage') as PipelineStage | null;

    const updates: Partial<PipelineState> = {};
    if (hazard === 'drought' || hazard === 'flood') {
      updates.hazard = hazard;
    }
    if (stage && VALID_STAGES.includes(stage)) {
      updates.stage = stage;
    }

    if (Object.keys(updates).length > 0) {
      dispatch({ type: 'syncFromUrl', payload: updates });
    }
  }, [searchParams]);

  const updateUrl = (hazard: DisasterType, stage: PipelineStage) => {
    const params = new URLSearchParams();
    params.set('hazard', hazard);
    params.set('stage', stage);
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const value = useMemo(
    () => ({
      ...state,
      setHazard: (hazard: DisasterType) => {
        dispatch({ type: 'setHazard', payload: hazard });
        updateUrl(hazard, state.stage);
      },
      setStage: (stage: PipelineStage) => {
        dispatch({ type: 'setStage', payload: stage });
        updateUrl(state.hazard, stage);
      },
      setSelectedMonth: (month: string | null) =>
        dispatch({ type: 'setSelectedMonth', payload: month }),
      setSelectedEventKey: (eventKey: string | null) =>
        dispatch({ type: 'setSelectedEventKey', payload: eventKey }),
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
