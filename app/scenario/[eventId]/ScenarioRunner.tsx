'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { PipelineProvider, usePipelineStore } from 'app/store/providers/pipeline';
import { DisasterCalendar } from 'app/components/dashboard/DisasterCalendar';
import { DisasterMap } from 'app/components/dashboard/DisasterMap';
import { BoundaryDagPanel } from 'app/components/dashboard/BoundaryDagPanel';
import { BoundaryDagPanelDrought } from 'app/components/dashboard/BoundaryDagPanelDrought';
import type { Scenario, EvidenceCard, RoundDecision } from 'app/types/scenario';
import {
  getActOneQuiz,
  quizComplete,
  inventoryLines,
  Q_RISK,
  Q_DOC,
  Q_MODEL_TRUST,
  type ActOneAnswers,
} from 'app/lib/scenario/quiz';

const TYPE_LABEL: Record<EvidenceCard['evidence_type'], string> = {
  hard: 'Hard evidence',
  soft: 'Soft evidence',
  virtual: 'Virtual evidence',
};

/** Three-act framing (cmra/quiz/quiz_reorient_three_Acts.md):
 *  I  What is happening?            — situational awareness + evidence quiz
 *  II What do we think is happening? — belief updating on the live BN rounds
 *  III What should we do and why?    — decision + reflection (debrief)        */
const ACTS = [
  { n: 1, title: 'Act I — Understanding the event', q: 'What is happening?' },
  { n: 2, title: 'Act II — Belief updating & risk', q: 'What do we think is happening?' },
  { n: 3, title: 'Act III — Decision & reflection', q: 'What should we do and why?' },
];

function ActBanner({ act }: { act: 1 | 2 | 3 }) {
  return (
    <ol className='usa-list usa-list--unstyled display-flex flex-row grid-gap margin-y-1'>
      {ACTS.map((a) => (
        <li
          key={a.n}
          className={`padding-05 padding-x-1 radius-md border-1px ${
            a.n === act ? 'bg-primary-lighter text-bold' : 'text-base'
          }`}
        >
          {a.title}
          <span className='display-block font-mono-3xs'>{a.q}</span>
        </li>
      ))}
    </ol>
  );
}

/** Map a scenario `bn_node` to the short key used in the BN-DAG JSON.
 *  Nodes with no DAG entry (CDI is post-hoc virtual evidence; R_obs is the DBN
 *  temporal channel) return null → the card falls back to its authored string. */
const DAG_KEY: Record<string, string | null> = {
  antecedent_rainfall: 'ant',
  exceedance_prob: 'exc',
  spatial_coverage: 'spa',
  rainfall_trend: 'trn',
  tail_risk: 'tail',
  cur: 'cur',
  def: 'def',
  spa: 'spa',
  trn: 'trn',
  cdi_class: null,
  R_obs: null,
};

type DagNode = { state?: string; probs?: number[]; raw?: string; p_he?: number };
type DagEntry = Record<string, DagNode>;

/** Authored fallback value (string compare works within a scenario). */
function authoredValue(card: EvidenceCard, cursor: string): string | null {
  const applicable = Object.keys(card.value_by_date)
    .filter((k) => k <= cursor)
    .sort();
  const k = applicable[applicable.length - 1];
  return k ? card.value_by_date[k] : null;
}

/** Prefer the live engine value (raw, else state) from the BN-DAG; else authored. */
function evidenceValue(card: EvidenceCard, dag: DagEntry | null, cursor: string) {
  const key = DAG_KEY[card.bn_node];
  const node = key && dag ? dag[key] : undefined;
  if (node) {
    return { value: node.raw ?? node.state ?? null, source: 'engine' as const, state: node.state };
  }
  return { value: authoredValue(card, cursor), source: 'scripted' as const, state: undefined };
}

function ScenarioBoard({ scenario }: { scenario: Scenario }) {
  const { setHazard, setStage, setSelectedMonth, setSelectedBoundary } = usePipelineStore();
  const [roundIndex, setRoundIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, RoundDecision>>({});
  const [quizAnswers, setQuizAnswers] = useState<ActOneAnswers>({});
  const [act, setAct] = useState<1 | 2 | 3>(1);
  const [showDebrief, setShowDebrief] = useState(false);
  const [dag, setDag] = useState<DagEntry | null>(null); // live BN-DAG entry for gid_1 at the cursor

  const round = scenario.rounds[roundIndex];
  const storageKey = `scenario:${scenario.event_id}`;
  const quiz = useMemo(() => getActOneQuiz(scenario), [scenario]);
  const quizDone = quizComplete(quiz, quizAnswers);

  // Restore saved answers (round decisions + Act I quiz).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setAnswers(JSON.parse(raw));
      const q = window.localStorage.getItem(`${storageKey}:act1`);
      if (q) setQuizAnswers(JSON.parse(q));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  function saveQuizAnswer(qid: string, value: string) {
    const next = { ...quizAnswers, [qid]: value };
    setQuizAnswers(next);
    try {
      window.localStorage.setItem(`${storageKey}:act1`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

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

  // Fetch the real BN-DAG for this cursor → bind evidence cards to engine values.
  // Falls back (dag=null) when offline / no backend; cards then use authored strings.
  useEffect(() => {
    let cancelled = false;
    const url = scenario.layers.risk_monitoring.dag
      .replace('{date}', round.cursor_date)
      .replace('{init}', round.cursor_date);
    setDag(null);
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setDag(json ? (json[scenario.gid_1] ?? null) : null);
      })
      .catch(() => {
        if (!cancelled) setDag(null);
      });
    return () => {
      cancelled = true;
    };
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

  // Calendar scoped to this event: monthly for drought, daily for flood, with the
  // year range bracketing the round cursors so it focuses on the event window.
  const calMode: 'monthly' | 'daily' = scenario.hazard === 'flood' ? 'daily' : 'monthly';
  const calYears = scenario.rounds.map((r) => parseInt(r.cursor_date.slice(0, 4), 10));
  const calStartYear = Math.min(...calYears);
  const calEndYear = Math.max(...calYears);

  // Precise event window from the round cursors (drought YYYY-MM, flood
  // YYYY-MM-DD). Drives the calendar window-gating (only these dates enabled)
  // and the date label — no longer just the YYYY–YYYY span.
  const cursors = scenario.rounds.map((r) => r.cursor_date).sort();
  const windowStart = cursors[0];
  const windowEnd = cursors[cursors.length - 1];
  const windowUnit = scenario.hazard === 'flood' ? 'daily' : 'monthly';

  return (
    <div className='grid-row grid-gap-lg margin-top-2'>
      {/* Left: simulation surface — evidence stream, advisory, decision */}
      <div className='tablet:grid-col-5'>
        <p className='eyebrow'>
          {scenario.hazard} · {scenario.country} — {scenario.admin1} · signal: {scenario.forecastability}
        </p>
        <h2>{scenario.title}</h2>
        <ActBanner act={act} />

        <p className='text-bold'>
          Round {round.round} / {scenario.rounds.length}: {round.title} ({round.cursor_date})
        </p>
        <p className='text-base-dark font-mono-3xs'>
          Event window: {windowStart} → {windowEnd} ({windowUnit})
        </p>
        {round.engine_state && <p className='text-base-dark'>Engine state: {round.engine_state}</p>}
        {roundIndex === 0 && scenario.brief_outcome_free && (
          <p className='usa-alert usa-alert--info usa-alert--slim padding-1'>{scenario.brief_outcome_free}</p>
        )}

        {/* Evidence stream */}
        <h3 className='margin-top-2'>Evidence</h3>
        <ul className='usa-list usa-list--unstyled'>
          {revealedCards.map((c) => {
            const ev = evidenceValue(c, dag, round.cursor_date);
            return (
              <li key={c.id} className='border-1px padding-1 margin-bottom-1 radius-md'>
                <span className={`usa-tag evidence-tag evidence-tag--${c.evidence_type}`}>
                  {TYPE_LABEL[c.evidence_type]}
                </span>{' '}
                <strong>{c.label}</strong>
                {ev.value && (
                  <div>
                    {ev.value}{' '}
                    <span className='text-base font-mono-3xs'>
                      [{ev.source === 'engine' ? 'live BN' : 'scripted'}]
                    </span>
                  </div>
                )}
                <div className='text-base'>BN node: <code>{c.bn_node}</code></div>
                {c.teaching_note && <div className='text-italic text-base-dark'>{c.teaching_note}</div>}
              </li>
            );
          })}
        </ul>

        {/* ACT I — evidence-elicitation quiz (generic template, all events; see
            app/lib/scenario/quiz.ts). Q7/Q8 commit a risk estimate + DOC call
            BEFORE any BN output is shown; Act III compares them to the engine. */}
        {act === 1 && (
          <div className='margin-top-2'>
            <h3>Act I quiz — build the evidence inventory</h3>
            <p className='text-base-dark'>
              Every answer becomes an input to the risk model: evidence → classification →
              confidence → belief update → decision. Not scored.
            </p>
            {quiz.map((q, i) => {
              const answered = quizAnswers[q.id];
              return (
                <fieldset key={q.id} className='usa-fieldset border-1px padding-1 margin-bottom-1 radius-md'>
                  <legend className='text-bold'>
                    Q{i + 1}. {q.prompt}
                  </legend>
                  {q.hint && <p className='text-base font-mono-3xs margin-y-05'>{q.hint}</p>}
                  {q.options.map((opt) => (
                    <label key={opt} className='usa-radio'>
                      <input
                        className='usa-radio__input'
                        type='radio'
                        name={`act1-${q.id}`}
                        checked={answered === opt}
                        onChange={() => saveQuizAnswer(q.id, opt)}
                      />
                      <span className='usa-radio__label'>{opt}</span>
                    </label>
                  ))}
                  {/* Formative feedback: once answered, reveal the teaching note (and,
                      for the literacy questions, confirm the intended option). */}
                  {answered && q.answer_note && (
                    <div className='usa-alert usa-alert--info usa-alert--slim padding-05 margin-top-05'>
                      {q.correct && (
                        <strong>{answered === q.correct ? '✓ ' : `✗ (${q.correct}) — `}</strong>
                      )}
                      {q.answer_note}
                    </div>
                  )}
                  {q.bn_purpose && (
                    <p className='text-italic text-base-dark margin-y-05'>BN purpose: {q.bn_purpose}</p>
                  )}
                </fieldset>
              );
            })}
            {quizDone && (
              <div className='usa-alert usa-alert--info padding-1'>
                <p className='text-bold'>Your answers generated:</p>
                <ul className='usa-list'>
                  {inventoryLines(quiz, quizAnswers).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <p>Updating the Bayesian network… watch the risk indication evolve round by round.</p>
                <button className='usa-button' onClick={() => setAct(2)}>
                  Enter Act II — belief updating →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Risk advisory — derived from the live BN posterior + cost-loss rule (CRMA).
            Hidden in Act I: the quiz commits estimates before any BN output is seen. */}
        {act > 1 && dag?.crma && (
          <div className='usa-alert usa-alert--warning usa-alert--slim padding-1'>
            <strong>Risk advisory:</strong> CRMA state <strong>{dag.crma.state}</strong>
            {dag.risk?.state && <> · risk posterior {dag.risk.state}</>}
            {typeof dag.crma.p_he === 'number' && <> · P(High+Extreme) = {dag.crma.p_he}</>}
          </div>
        )}

        {/* Decision (checkpoint rounds — Act II onward) */}
        {act > 1 && round.checkpoint && !showDebrief && (
          <div className='margin-top-2'>
            <h3>DOC decision</h3>
            {scenario.decision.checkpoint_prompt && <p>{scenario.decision.checkpoint_prompt}</p>}
            {round.quiz && round.quiz.length > 0 && (
              <p className='text-base-dark'>
                Consider: {round.quiz.map((q) => q.replace(/_/g, ' ')).join(' · ')}
              </p>
            )}
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
                    {rung} <span className='text-base'>→ {scenario.decision.crma_mapping[rung]}</span>
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

        {/* Navigation (rounds belong to Act II; Act I gates on the quiz) */}
        {act > 1 && (
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
              <button
                className='usa-button'
                onClick={() => {
                  setAct(3);
                  setShowDebrief(true);
                }}
              >
                Act III — reveal debrief
              </button>
            )}
          </div>
        )}

        {/* Debrief — Risk Knowledge: work backward from the recorded loss & damage. */}
        {showDebrief && (
          <div className='usa-alert usa-alert--warning margin-top-2 padding-1'>
            <h3>Act III — Decision &amp; reflection: what actually happened</h3>

            {/* Pre-BN quiz estimate vs the engine's indication (quiz_templates.md debrief).
                The divergence — either direction — is the learning moment, not a score. */}
            <div className='border-1px padding-1 radius-md margin-bottom-1'>
              <p className='text-bold'>Your Act I estimate vs the engine</p>
              <p>
                Risk: you said <strong>{quizAnswers[Q_RISK] ?? '—'}</strong> · engine risk
                indication at the final round: <strong>{dag?.risk?.state ?? 'offline'}</strong>
              </p>
              <p>
                DOC status: you said <strong>{quizAnswers[Q_DOC] ?? '—'}</strong>
                {quizAnswers[Q_DOC] && (
                  <> (→ {scenario.decision.crma_mapping[quizAnswers[Q_DOC]]})</>
                )}{' '}
                · engine CRMA state: <strong>{dag?.crma?.state ?? 'offline'}</strong>
                {answers[round.round]?.doc_level && (
                  <> · your final committed decision: <strong>{answers[round.round].doc_level}</strong></>
                )}
              </p>
              <p className='text-italic'>
                If they differ: which evidence did you overweight, or underweight? And recall
                your Act I answer on trusting the model
                {quizAnswers[Q_MODEL_TRUST] && <> (&ldquo;{quizAnswers[Q_MODEL_TRUST]}&rdquo;)</>}:
                the engine is expert judgment written as explicit, consistent rules — a risk
                indication, not a calibrated probability. Where the engine itself diverges from
                the recorded outcome below, trace why — that model criticism is the fourth thing
                this exercise teaches.
              </p>
            </div>

            <p>
              <strong>Peak:</strong> {scenario.peak.date} — {scenario.peak.description}
            </p>

            {/* The recorded loss & damage lives in the Risk Knowledge stage (EM-DAT
                storyline). Open it to reconstruct which signals preceded the crisis. */}
            <p>
              <a
                className='usa-button'
                href={
                  `/?hazard=${scenario.hazard}&stage=risk-knowledge` +
                  (scenario.debrief.rk_month ? `&month=${scenario.debrief.rk_month}` : '') +
                  `&event=${scenario.emdat_event_key}`
                }
                target='_blank'
                rel='noreferrer'
              >
                Open Risk Knowledge storyline — loss &amp; damage ({scenario.emdat_event_key}) →
              </a>
            </p>

            {scenario.counterfactual && (
              <p>
                <strong>Counterfactual:</strong> {scenario.counterfactual.prompt}{' '}
                {scenario.counterfactual.narrative}
              </p>
            )}

            {/* Optional hazard footprint (provenance only; not in the drought flow). */}
            {scenario.layers.hazard && (
              <details className='margin-top-1'>
                <summary className='text-base-dark'>
                  Hazard footprint ({scenario.layers.hazard.type}, {scenario.layers.hazard.validation}) — supporting science
                </summary>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={scenario.layers.hazard.asset_url}
                  alt={scenario.layers.hazard.caption}
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
                <p className='text-base-dark'>{scenario.layers.hazard.caption}</p>
              </details>
            )}
            {scenario.debrief.loss_note_2026 && (
              <p className='text-base-dark'>{scenario.debrief.loss_note_2026}</p>
            )}
          </div>
        )}
      </div>

      {/* Right: live evidence + risk visuals (the BN reasoning the participant sees) */}
      <div className='tablet:grid-col-7'>
        {/* TODO(styling): store-driven panels follow the cursor; verify sizing outside
            the dashboard grid. They render null on hazard/stage mismatch.
            Calendar (monthly drought / daily flood) is scoped to the event years and
            highlights the active round cursor; choropleth is zoomed to the country. */}
        <DisasterCalendar
          mode={calMode}
          startYear={calStartYear}
          endYear={calEndYear}
          focusCountry={scenario.gid_1?.split('.')[0]}
          windowStart={windowStart}
          windowEnd={windowEnd}
        />
        <DisasterMap focusCountry={scenario.gid_1?.split('.')[0]} />
        {/* BN DAG = model output; revealed in Act II so the Act I quiz commits a
            risk estimate before the participant sees what the model thinks. */}
        {act > 1 && <BoundaryDagPanel />}
        {act > 1 && <BoundaryDagPanelDrought />}
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
