'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { PipelineProvider, usePipelineStore } from 'app/store/providers/pipeline';
import { DisasterMap } from 'app/components/dashboard/DisasterMap';
import { BoundaryDagPanel } from 'app/components/dashboard/BoundaryDagPanel';
import { BoundaryDagPanelDrought } from 'app/components/dashboard/BoundaryDagPanelDrought';
import type { Scenario, EvidenceCard, RoundDecision } from 'app/types/scenario';

const TYPE_LABEL: Record<EvidenceCard['evidence_type'], string> = {
  hard: 'Hard evidence',
  soft: 'Soft evidence',
  virtual: 'Virtual evidence',
};

/** Value of a card at/just-before the cursor (string compare works within a scenario). */
function valueAtCursor(card: EvidenceCard, cursor: string): string | null {
  const applicable = Object.keys(card.value_by_date)
    .filter((k) => k <= cursor)
    .sort();
  const k = applicable[applicable.length - 1];
  return k ? card.value_by_date[k] : null;
}

function ScenarioBoard({ scenario }: { scenario: Scenario }) {
  const { setHazard, setStage, setSelectedMonth, setSelectedBoundary } = usePipelineStore();
  const [roundIndex, setRoundIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, RoundDecision>>({});
  const [showDebrief, setShowDebrief] = useState(false);

  const round = scenario.rounds[roundIndex];
  const storageKey = `scenario:${scenario.event_id}`;

  // Restore saved answers.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setAnswers(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  // Drive the shared store cursor whenever the round changes → the live BN map/DAG follow.
  useEffect(() => {
    setHazard(scenario.hazard);
    setStage('risk-monitoring');
    setSelectedMonth(round.cursor_date);
    if (scenario.gid_1 && !scenario.gid_1.startsWith('TODO')) {
      setSelectedBoundary(scenario.gid_1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIndex]);

  // Evidence unlocked through the current round.
  const revealedIds = useMemo(() => {
    const ids = new Set<string>();
    scenario.rounds.slice(0, roundIndex + 1).forEach((r) => r.reveal_evidence.forEach((id) => ids.add(id)));
    return ids;
  }, [scenario, roundIndex]);

  const revealedCards = scenario.evidence_cards.filter((c) => revealedIds.has(c.id));

  function saveDecision(partial: Partial<RoundDecision>) {
    const next: Record<number, RoundDecision> = {
      ...answers,
      [round.round]: {
        round: round.round,
        doc_level: answers[round.round]?.doc_level ?? '',
        uncertainty_note: answers[round.round]?.uncertainty_note ?? '',
        no_regret: answers[round.round]?.no_regret ?? false,
        ...partial,
      },
    };
    setAnswers(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const isLast = roundIndex === scenario.rounds.length - 1;
  const current = answers[round.round];

  return (
    <div className='grid-row grid-gap-lg margin-top-2'>
      {/* Left: scenario chrome */}
      <div className='tablet:grid-col-5'>
        <p className='eyebrow'>
          {scenario.hazard} · {scenario.country} — {scenario.admin1} · signal: {scenario.forecastability}
        </p>
        <h2>{scenario.title}</h2>

        {/* Round stepper */}
        <p className='text-bold'>
          Round {round.round} / {scenario.rounds.length}: {round.title} ({round.cursor_date})
        </p>
        {round.engine_state && <p className='text-base-dark'>Engine state: {round.engine_state}</p>}
        {roundIndex === 0 && scenario.brief_outcome_free && (
          <p className='usa-alert usa-alert--info usa-alert--slim padding-1'>{scenario.brief_outcome_free}</p>
        )}

        {/* Evidence cards */}
        <h3 className='margin-top-2'>Evidence</h3>
        <ul className='usa-list usa-list--unstyled'>
          {revealedCards.map((c) => {
            const v = valueAtCursor(c, round.cursor_date);
            return (
              <li key={c.id} className='border-1px padding-1 margin-bottom-1 radius-md'>
                <span className={`usa-tag evidence-tag evidence-tag--${c.evidence_type}`}>
                  {TYPE_LABEL[c.evidence_type]}
                </span>{' '}
                <strong>{c.label}</strong>
                {v && <div>{v}</div>}
                <div className='text-base'>BN node: <code>{c.bn_node}</code></div>
                {c.teaching_note && <div className='text-italic text-base-dark'>{c.teaching_note}</div>}
              </li>
            );
          })}
        </ul>

        {/* Decision (checkpoint rounds) */}
        {round.checkpoint && !showDebrief && (
          <div className='margin-top-2'>
            <h3>DOC decision</h3>
            {scenario.decision.checkpoint_prompt && <p>{scenario.decision.checkpoint_prompt}</p>}
            <fieldset className='usa-fieldset'>
              {scenario.decision.ladder.map((rung) => (
                <label key={rung} className='usa-radio'>
                  <input
                    className='usa-radio__input'
                    type='radio'
                    name={`doc-${round.round}`}
                    checked={current?.doc_level === rung}
                    onChange={() => saveDecision({ doc_level: rung })}
                  />
                  <span className='usa-radio__label'>
                    {rung}{' '}
                    <span className='text-base'>→ {scenario.decision.crma_mapping[rung]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {scenario.decision.require_uncertainty_note && (
              <label className='usa-label'>
                Uncertainty note (required — what is ambiguous, what would change your mind?)
                <textarea
                  className='usa-textarea'
                  value={current?.uncertainty_note ?? ''}
                  onChange={(e) => saveDecision({ uncertainty_note: e.target.value })}
                />
              </label>
            )}
            {scenario.decision.allow_no_regret && (
              <label className='usa-checkbox'>
                <input
                  className='usa-checkbox__input'
                  type='checkbox'
                  checked={current?.no_regret ?? false}
                  onChange={(e) => saveDecision({ no_regret: e.target.checked })}
                />
                <span className='usa-checkbox__label'>Recommend a no-regret / precautionary action</span>
              </label>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className='margin-top-2'>
          <button
            className='usa-button usa-button--outline'
            disabled={roundIndex === 0}
            onClick={() => setRoundIndex((i) => Math.max(0, i - 1))}
          >
            Previous
          </button>
          {!isLast ? (
            <button className='usa-button' onClick={() => setRoundIndex((i) => i + 1)}>
              Next round
            </button>
          ) : (
            <button className='usa-button' onClick={() => setShowDebrief(true)}>
              Reveal debrief
            </button>
          )}
        </div>

        {/* Debrief */}
        {showDebrief && (
          <div className='usa-alert usa-alert--warning margin-top-2 padding-1'>
            <h3>Debrief — what actually happened</h3>
            <p>
              <strong>Peak:</strong> {scenario.peak.date} — {scenario.peak.description}
            </p>
            {scenario.counterfactual && (
              <p>
                <strong>Counterfactual:</strong> {scenario.counterfactual.prompt}{' '}
                {scenario.counterfactual.narrative}
              </p>
            )}
            <p>
              Recorded loss &amp; damage:{' '}
              <a
                className='usa-link'
                href={`/?hazard=${scenario.hazard}&stage=risk-knowledge&event=${scenario.emdat_event_key}`}
                target='_blank'
                rel='noreferrer'
              >
                open EM-DAT storyline ({scenario.emdat_event_key})
              </a>
            </p>
            {scenario.debrief.loss_note_2026 && (
              <p className='text-base-dark'>{scenario.debrief.loss_note_2026}</p>
            )}
          </div>
        )}
      </div>

      {/* Right: reused live BN panels + hazard footprint */}
      <div className='tablet:grid-col-7'>
        {/* TODO(styling): these dashboard panels are store-driven and follow the cursor;
            verify sizing outside the dashboard grid. They render null on hazard/stage mismatch. */}
        <DisasterMap />
        <BoundaryDagPanel />
        <BoundaryDagPanelDrought />

        <div className='card margin-top-2'>
          <h3>Hazard model — {scenario.layers.hazard.type.toUpperCase()}</h3>
          <p className='usa-tag bg-base-light text-ink'>validation: {scenario.layers.hazard.validation}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scenario.layers.hazard.asset_url}
            alt={scenario.layers.hazard.caption}
            style={{ maxWidth: '100%', height: 'auto' }}
          />
          <p className='text-base-dark'>{scenario.layers.hazard.caption}</p>
        </div>
      </div>
    </div>
  );
}

export function ScenarioRunner({ scenario }: { scenario: Scenario }) {
  // syncUrl={false}: drive the store programmatically without navigating back to `/`.
  return (
    <PipelineProvider syncUrl={false}>
      <ScenarioBoard scenario={scenario} />
    </PipelineProvider>
  );
}
