'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { PipelineProvider, usePipelineStore } from 'app/store/providers/pipeline';
import { DisasterCalendar } from 'app/components/dashboard/DisasterCalendar';
import { DisasterMap } from 'app/components/dashboard/DisasterMap';
import { BoundaryDagPanel } from 'app/components/dashboard/BoundaryDagPanel';
import { BoundaryCrmaMrPanel } from 'app/components/dashboard/BoundaryCrmaMrPanel';
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
  { n: 1, roman: 'I', short: 'Understand', title: 'Act I — Understanding the event', q: 'What is happening?' },
  { n: 2, roman: 'II', short: 'Update beliefs', title: 'Act II — Belief updating & risk', q: 'What do we think is happening?' },
  { n: 3, roman: 'III', short: 'Decide & reflect', title: 'Act III — Decision & reflection', q: 'What should we do and why?' },
];

/** Horizontal three-step stepper: "Act I · Understand" with the act's guiding
 *  question as a subtitle. Full act title kept as the tooltip / accessible name. */
function ActBanner({ act }: { act: 1 | 2 | 3 }) {
  // A progress indicator, not navigation: acts unlock in order (Act I quiz →
  // Act II rounds → Act III debrief), so the steps are deliberately not buttons.
  return (
    <ol className='scn-acts' aria-label='Workshop progress'>
      {ACTS.map((a) => {
        const state = a.n === act ? 'current' : a.n < act ? 'done' : 'todo';
        const status = state === 'current' ? 'current' : state === 'done' ? 'completed' : 'not started';
        return (
          <li
            key={a.n}
            className={`scn-acts__step scn-acts__step--${state}`}
            aria-current={a.n === act ? 'step' : undefined}
            title={a.title}
          >
            <span className='scn-acts__mark' aria-hidden='true'>
              {state === 'done' ? '✓' : a.roman}
            </span>
            <span className='scn-acts__text'>
              <span className='scn-acts__name'>
                Act {a.roman} · {a.short}
                <span className='ds-visually-hidden'> ({status})</span>
              </span>
              <span className='scn-acts__q'>{a.q}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Plain-language meaning of the three evidence types, from the BN's point of
 *  view (hard = observation, soft = probability vector, virtual = likelihood message). */
const TYPE_HELP: Record<EvidenceCard['evidence_type'], string> = {
  hard: 'An observed fact — entered into the model as certain (e.g. measured rainfall).',
  soft: 'A probability, not a fact — e.g. a forecast; its spread is the confidence.',
  virtual: 'An indirect message the model weighs — e.g. yesterday’s model state carried forward, or a post-event index.',
};
const TYPE_ICON: Record<EvidenceCard['evidence_type'], string> = {
  hard: '●',
  soft: '◐',
  virtual: '◌',
};

function TypeBadge({ type }: { type: EvidenceCard['evidence_type'] }) {
  return (
    <span className={`scn-etype scn-etype--${type}`}>
      <span aria-hidden='true'>{TYPE_ICON[type]}</span>
      {TYPE_LABEL[type]}
    </span>
  );
}

/** Large, keyboard-operable option row wrapping a native radio/checkbox. */
function OptionRow({
  type,
  name,
  checked,
  onChange,
  children,
}: {
  type: 'radio' | 'checkbox';
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className={`scn-opt${checked ? ' is-selected' : ''}`}>
      <input
        className='scn-opt__input'
        type={type}
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className='scn-opt__text'>{children}</span>
      {checked && type === 'radio' && (
        <span className='scn-opt__tag'>
          <span aria-hidden='true'>✓ </span>Selected
        </span>
      )}
    </label>
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2019-05-08" → "08 May 2019", "2021-01" → "Jan 2021". String-only (no Date
 *  parsing) so there is no timezone shift and no SSR/client mismatch. */
function formatCursor(iso: string): string {
  const [y, m, d] = iso.split('-');
  const mon = MONTH_NAMES[parseInt(m, 10) - 1];
  if (!y || !mon) return iso;
  return d ? `${d} ${mon} ${y}` : `${mon} ${y}`;
}

/** Round titles sometimes already carry the cursor date ("Early monitoring
 *  (2019-05-08)"); the header shows the date, so drop the duplicate. */
function roundSubtitle(title: string, cursor: string): string {
  return title.replace(` (${cursor})`, '').replace(cursor, '').trim() || title;
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

/** Authored fallback value (string compare works within a scenario).
 *  Virtual-evidence cards (e.g. flood `dbn_carry` / R_obs) carry no `value_by_date`
 *  — the live BN supplies the value — so guard against it being undefined. */
function authoredValue(card: EvidenceCard, cursor: string): string | null {
  if (!card.value_by_date) return null;
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
  // Act I quiz step: index of the question on screen, quiz.length = review
  // screen, null = auto (first unanswered, or review when all are done).
  const [qStep, setQStep] = useState<number | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false); // evidence list collapsed by default

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

  // Act I quiz flow: ONE question on screen at a time. Answering shows the
  // feedback; Next moves on and the answered question leaves the screen. Back
  // returns to the previous one. After the last, a review screen lists every
  // answer with Change. quizComplete gating is unchanged.
  const firstUnanswered = quiz.findIndex((q) => !quizAnswers[q.id]);
  const step = qStep ?? (firstUnanswered === -1 ? quiz.length : firstUnanswered);
  const reviewing = step >= quiz.length;
  const answeredCount = quiz.filter((q) => Boolean(quizAnswers[q.id])).length;

  const roundNav = (
    <nav className='scn-nav' aria-label='Rounds'>
      <button
        type='button'
        className='ds-btn ds-btn--secondary scn-btn-lg'
        disabled={roundIndex === 0}
        onClick={() => setRoundIndex((i) => Math.max(0, i - 1))}
      >
        <span aria-hidden='true'>←</span> Previous round
      </button>
      {!isLast ? (
        <button type='button' className='ds-btn ds-btn--primary scn-btn-lg' onClick={() => setRoundIndex((i) => i + 1)}>
          Next round <span aria-hidden='true'>→</span>
        </button>
      ) : (
        !showDebrief && (
          <button
            type='button'
            className='ds-btn ds-btn--primary scn-btn-lg'
            onClick={() => {
              setAct(3);
              setShowDebrief(true);
            }}
          >
            Act III — reveal debrief <span aria-hidden='true'>→</span>
          </button>
        )
      )}
    </nav>
  );

  const hazardKey = scenario.hazard === 'flood' || scenario.hazard === 'drought' ? scenario.hazard : 'other';
  const quizPct = quiz.length ? Math.round((answeredCount / quiz.length) * 100) : 0;

  return (
    <div className='scn-board'>
      {/* Round header — large enough to read from across a table. */}
      <header className='scn-round-header'>
        <div className='scn-round-header__main'>
          <p className='scn-round-header__eyebrow'>
            <span className={`scn-hz-badge scn-hz-badge--${hazardKey}`}>
              <span className={`scn-hz-dot scn-hz-dot--${hazardKey}`} aria-hidden='true' />
              {scenario.hazard}
            </span>
            <span>
              {scenario.country} — {scenario.admin1}
            </span>
            <span className='scn-secondary'>signal: {scenario.forecastability}</span>
          </p>
          <h1 className='scn-round-header__scenario'>{scenario.title}</h1>
          <p className='scn-round-header__round'>
            Round {round.round} of {scenario.rounds.length} · {formatCursor(round.cursor_date)}
          </p>
          <ol className='scn-rounds' aria-label={`Round ${round.round} of ${scenario.rounds.length}`}>
            {scenario.rounds.map((r, i) => (
              <li
                key={r.round}
                className={`scn-rounds__seg${i < roundIndex ? ' is-done' : ''}${i === roundIndex ? ' is-current' : ''}`}
                aria-current={i === roundIndex ? 'step' : undefined}
              >
                <span className='ds-visually-hidden'>
                  Round {r.round}, {formatCursor(r.cursor_date)}
                </span>
              </li>
            ))}
          </ol>
          <p className='scn-round-header__sub'>
            {roundSubtitle(round.title, round.cursor_date)}
            <span className='scn-round-header__window'>
              Event window: {windowStart} → {windowEnd} ({windowUnit})
            </span>
          </p>
        </div>
        <div className='scn-round-header__side'>
          <ActBanner act={act} />
          <div className='scn-round-header__tools'>
            {act > 1 && roundNav}
          </div>
        </div>
      </header>

      <div className='scn-grid'>
        {/* Left: simulation surface — evidence stream, advisory, decision */}
        <div className='scn-left'>
          {round.engine_state && (
            <p className='scn-engine'>
              <span className='scn-label'>Engine state</span> {round.engine_state}
            </p>
          )}
          {roundIndex === 0 && scenario.brief_outcome_free && (
            <p className='scn-callout scn-callout--info scn-brief'>{scenario.brief_outcome_free}</p>
          )}

          {/* Evidence stream — collapsible so the question flow stays short.
              The summary names the cards, so a group knows what is inside. */}
          <details
            className='scn-evbox'
            open={evidenceOpen}
            onToggle={(e) => setEvidenceOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className='scn-evbox__summary'>
              <span className='scn-evbox__title'>
                Evidence on the table
                <span className='scn-muted'>
                  {' '}· {revealedCards.length} {revealedCards.length === 1 ? 'card' : 'cards'}
                </span>
              </span>
              <span className='scn-evbox__labels'>{revealedCards.map((c) => c.label).join(' · ')}</span>
              <span className='scn-evbox__toggle' aria-hidden='true'>{evidenceOpen ? 'Hide' : 'Show'}</span>
            </summary>
            <details className='scn-evbox__help'>
              <summary>What do hard, soft and virtual evidence mean?</summary>
              <div className='ds-legend scn-etype-legend scn-secondary'>
                <p className='ds-legend__title'>Evidence types — how the model treats each card</p>
                <dl className='scn-etype-legend__list'>
                  {(['hard', 'soft', 'virtual'] as const).map((t) => (
                    <div key={t} className='scn-etype-legend__row'>
                      <dt>
                        <TypeBadge type={t} />
                      </dt>
                      <dd>{TYPE_HELP[t]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </details>
            <ul className='scn-evidence'>
              {revealedCards.map((c) => {
                const ev = evidenceValue(c, dag, round.cursor_date);
                return (
                  <li key={c.id} className={`scn-card scn-card--${c.evidence_type}`}>
                    <div className='scn-card__head'>
                      <TypeBadge type={c.evidence_type} />
                      {ev.value && (
                        <span
                          className={`scn-card__source scn-card__source--${ev.source}`}
                          title={
                            ev.source === 'engine'
                              ? 'Value read live from the Bayesian network for this date'
                              : 'Authored value from the scenario script (engine offline or no matching node)'
                          }
                        >
                          {ev.source === 'engine' ? 'live BN' : 'scripted'}
                        </span>
                      )}
                    </div>
                    <h3 className='scn-card__label'>{c.label}</h3>
                    {ev.value && <p className='scn-card__value'>{ev.value}</p>}
                    {c.teaching_note && <p className='scn-card__note'>{c.teaching_note}</p>}
                    <p className='scn-card__meta scn-secondary'>
                      BN node: <code>{c.bn_node}</code>
                    </p>
                  </li>
                );
              })}
            </ul>
          </details>

          {/* ACT I — evidence-elicitation quiz (generic template, all events; see
              app/lib/scenario/quiz.ts). Q7/Q8 commit a risk estimate + DOC call
              BEFORE any BN output is shown; Act III compares them to the engine. */}
          {act === 1 && (
            <section className='scn-quiz' aria-labelledby='scn-quiz-title'>
              <h2 className='scn-h2' id='scn-quiz-title'>
                Act I — understand the evidence
              </h2>
              <p className='scn-muted scn-secondary'>
                Every answer becomes an input to the risk model: evidence → classification →
                confidence → belief update → decision. Not scored.
              </p>
              <div className='scn-progress'>
                <p className='scn-quiz__progress' aria-live='polite'>
                  {answeredCount} of {quiz.length} answered
                  {!quizDone && <> — {quiz.length - answeredCount} left before Act II</>}
                </p>
                <div
                  className='scn-progress__bar'
                  role='progressbar'
                  aria-label='Act I quiz progress'
                  aria-valuemin={0}
                  aria-valuemax={quiz.length}
                  aria-valuenow={answeredCount}
                >
                  <span style={{ width: `${quizPct}%` }} />
                </div>
              </div>
              {!reviewing && (() => {
                const i = step;
                const q = quiz[i];
                const answered = quizAnswers[q.id];
                const isRight = q.correct ? answered === q.correct : null;
                const isLastQ = i === quiz.length - 1;
                return (
                  <fieldset key={q.id} className='scn-quiz__q'>
                    <legend className='scn-quiz__prompt'>
                      <span className='scn-quiz__qnum'>
                        Question {i + 1} of {quiz.length}
                      </span>
                      {q.prompt}
                    </legend>
                    {q.hint && <p className='scn-quiz__hint'>{q.hint}</p>}
                    <div className='scn-opts'>
                      {q.options.map((opt) => (
                        <OptionRow
                          key={opt}
                          type='radio'
                          name={`act1-${q.id}`}
                          checked={answered === opt}
                          onChange={() => {
                            saveQuizAnswer(q.id, opt);
                            setQStep(i); // stay here so the feedback is read
                          }}
                        >
                          {opt}
                        </OptionRow>
                      ))}
                    </div>
                    {/* Formative feedback: once answered, reveal the teaching note (and,
                        for the literacy questions, confirm the intended option). */}
                    {answered && q.answer_note && (
                      <div
                        className={`scn-fb${isRight === true ? ' scn-fb--right' : isRight === false ? ' scn-fb--wrong' : ''}`}
                        role='status'
                      >
                        {isRight === true && (
                          <p className='scn-fb__title'>
                            <span aria-hidden='true'>✓ </span>Matches the intended answer
                          </p>
                        )}
                        {isRight === false && (
                          <p className='scn-fb__title'>
                            <span aria-hidden='true'>✗ </span>Not the intended answer — intended: {q.correct}
                          </p>
                        )}
                        <p className='scn-fb__body'>{q.answer_note}</p>
                      </div>
                    )}
                    {q.bn_purpose && <p className='scn-quiz__purpose scn-secondary'>BN purpose: {q.bn_purpose}</p>}
                    <div className='scn-quiz__nav'>
                      <button
                        type='button'
                        className='ds-btn ds-btn--secondary scn-btn-lg'
                        disabled={i === 0}
                        onClick={() => setQStep(i - 1)}
                      >
                        <span aria-hidden='true'>←</span> Back
                      </button>
                      <button
                        type='button'
                        className='ds-btn ds-btn--primary scn-btn-lg scn-quiz__next'
                        disabled={!answered}
                        onClick={() => setQStep(i + 1)}
                      >
                        {isLastQ ? 'Review all answers' : 'Next question'} <span aria-hidden='true'>→</span>
                      </button>
                    </div>
                  </fieldset>
                );
              })()}
              {reviewing && (
                <div className='scn-quiz__review'>
                  <h3 className='scn-h3'>Your answers</h3>
                  <ol className='scn-quiz__answers'>
                    {quiz.map((q, i) => (
                      <li key={q.id} className='scn-quiz__answer'>
                        <span className='scn-quiz__answer-q'>
                          <span className='scn-quiz__rownum'>Q{i + 1}</span> {q.prompt}
                        </span>
                        <span className='scn-quiz__answer-a'>{quizAnswers[q.id] ?? 'Not answered yet'}</span>
                        <button
                          type='button'
                          className='ds-btn ds-btn--ghost ds-btn--sm'
                          onClick={() => setQStep(i)}
                          aria-label={`Change answer to question ${i + 1}`}
                        >
                          Change
                        </button>
                      </li>
                    ))}
                  </ol>
                  {!quizDone && (
                    <button
                      type='button'
                      className='ds-btn ds-btn--primary scn-btn-lg'
                      onClick={() => setQStep(firstUnanswered)}
                    >
                      Answer the remaining questions <span aria-hidden='true'>→</span>
                    </button>
                  )}
                </div>
              )}
              {quizDone && reviewing && (
                <div className='scn-callout scn-callout--success scn-quiz__done'>
                  <p className='scn-callout__title'>
                    <span aria-hidden='true'>✓ </span>Your answers generated:
                  </p>
                  <ul className='scn-quiz__inventory'>
                    {inventoryLines(quiz, quizAnswers).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <p>Updating the Bayesian network… watch the risk indication evolve round by round.</p>
                  <button type='button' className='ds-btn ds-btn--primary scn-btn-lg' onClick={() => setAct(2)}>
                    Enter Act II — belief updating <span aria-hidden='true'>→</span>
                  </button>
                </div>
              )}
            </section>
          )}

        {/* Risk advisory — derived from the live BN posterior + cost-loss rule (CRMA).
            Hidden in Act I: the quiz commits estimates before any BN output is seen. */}
        {act > 1 && dag?.crma && (
          <div className='scn-callout scn-callout--warning scn-advisory'>
            <strong>Risk advisory:</strong> CRMA state <strong>{dag.crma.state}</strong>
            {dag.risk?.state && <> · risk posterior {dag.risk.state}</>}
            {typeof dag.crma.p_he === 'number' && <> · P(High+Extreme) = {dag.crma.p_he}</>}
          </div>
        )}

        {/* Decision (checkpoint rounds — Act II onward) */}
        {act > 1 && round.checkpoint && !showDebrief && (
          <section className='scn-decision ds-card' aria-labelledby='scn-decision-title'>
            <h2 className='scn-h2' id='scn-decision-title'>
              DOC decision
            </h2>
            {scenario.decision.checkpoint_prompt && <p>{scenario.decision.checkpoint_prompt}</p>}
            {round.quiz && round.quiz.length > 0 && (
              <p className='scn-muted'>
                Consider: {round.quiz.map((q) => q.replace(/_/g, ' ')).join(' · ')}
              </p>
            )}
            <fieldset className='scn-decision__ladder'>
              <legend className='ds-visually-hidden'>DOC level for round {round.round}</legend>
              <div className='scn-opts'>
                {scenario.decision.ladder.map((rung) => (
                  <OptionRow
                    key={rung}
                    type='radio'
                    name={`doc-${round.round}`}
                    checked={current?.doc_level === rung}
                    onChange={() => saveDecision({ doc_level: rung })}
                  >
                    <span className='scn-opt__main'>{rung}</span>
                    <span className='scn-opt__sub'>→ {scenario.decision.crma_mapping[rung]}</span>
                  </OptionRow>
                ))}
              </div>
            </fieldset>
            {scenario.decision.require_uncertainty_note && (
              <label className='scn-field'>
                <span className='scn-field__label'>
                  Uncertainty note (required — what is ambiguous, what would change your mind?)
                </span>
                <textarea
                  className='scn-textarea'
                  rows={4}
                  value={current?.uncertainty_note ?? ''}
                  onChange={(e) => saveDecision({ uncertainty_note: e.target.value })}
                />
              </label>
            )}
            {scenario.decision.allow_no_regret && (
              <div className='scn-opts'>
                <OptionRow
                  type='checkbox'
                  checked={current?.no_regret ?? false}
                  onChange={(checked) => saveDecision({ no_regret: checked })}
                >
                  Recommend a no-regret / precautionary action
                </OptionRow>
              </div>
            )}
          </section>
        )}

        {/* Navigation (rounds belong to Act II; Act I gates on the quiz) */}
        {act > 1 && roundNav}

        {/* Debrief — Risk Knowledge: work backward from the recorded loss & damage. */}
        {showDebrief && (
          <section className='ds-card scn-debrief' aria-labelledby='scn-debrief-title'>
            <h2 className='scn-h2' id='scn-debrief-title'>
              Act III — Decision &amp; reflection: what actually happened
            </h2>

            {/* Pre-BN quiz estimate vs the engine's indication (quiz_templates.md debrief).
                The divergence — either direction — is the learning moment, not a score. */}
            <div className='scn-compare'>
              <h3 className='scn-h3'>Your Act I estimate vs the engine</h3>
              <dl className='scn-compare__grid'>
                <div className='scn-compare__row'>
                  <dt>Risk</dt>
                  <dd>
                    you said <strong>{quizAnswers[Q_RISK] ?? '—'}</strong> · engine risk
                    indication at the final round: <strong>{dag?.risk?.state ?? 'offline'}</strong>
                  </dd>
                </div>
                <div className='scn-compare__row'>
                  <dt>DOC status</dt>
                  <dd>
                    you said <strong>{quizAnswers[Q_DOC] ?? '—'}</strong>
                    {quizAnswers[Q_DOC] && (
                      <> (→ {scenario.decision.crma_mapping[quizAnswers[Q_DOC]]})</>
                    )}{' '}
                    · engine CRMA state: <strong>{dag?.crma?.state ?? 'offline'}</strong>
                    {answers[round.round]?.doc_level && (
                      <> · your final committed decision: <strong>{answers[round.round].doc_level}</strong></>
                    )}
                  </dd>
                </div>
              </dl>
              <p className='scn-compare__reflect'>
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
                className='ds-btn ds-btn--primary scn-btn-lg scn-btn-wrap'
                href={
                  `/?hazard=${scenario.hazard}&stage=risk-knowledge` +
                  (scenario.debrief.rk_month ? `&month=${scenario.debrief.rk_month}` : '') +
                  `&event=${scenario.emdat_event_key}`
                }
                target='_blank'
                rel='noreferrer'
              >
                Open Risk Knowledge storyline — loss &amp; damage ({scenario.emdat_event_key}){' '}
                <span aria-hidden='true'>↗</span>
                <span className='ds-visually-hidden'> (opens in a new tab)</span>
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
              <details className='scn-details'>
                <summary>
                  Hazard footprint ({scenario.layers.hazard.type}, {scenario.layers.hazard.validation}) — supporting science
                </summary>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={scenario.layers.hazard.asset_url}
                  alt={scenario.layers.hazard.caption}
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
                <p className='scn-muted'>{scenario.layers.hazard.caption}</p>
              </details>
            )}
            {scenario.debrief.loss_note_2026 && (
              <p className='scn-muted'>{scenario.debrief.loss_note_2026}</p>
            )}
          </section>
        )}
        </div>

        {/* Right: live evidence + risk visuals (the BN reasoning the participant sees).
            Sticky on tablet+ so the map stays on screen while the left column
            scrolls; it scrolls internally when the Act II panels make it tall. */}
        <div className='scn-right'>
          {/* Store-driven panels follow the cursor; they render null on
              hazard/stage mismatch. Map first and large (choropleth zoomed to the
              country), then the calendar as a compact strip over the event window
              only, highlighting the active round cursor. */}
          <DisasterMap focusCountry={scenario.gid_1?.split('.')[0]} enableZoom />
          <DisasterCalendar
            mode={calMode}
            startYear={calStartYear}
            endYear={calEndYear}
            focusCountry={scenario.gid_1?.split('.')[0]}
            windowStart={windowStart}
            windowEnd={windowEnd}
          />
          {/* BN DAG = model output; revealed in Act II so the Act I quiz commits a
              risk estimate before the participant sees what the model thinks. */}
          {/* Two flood panels, each self-gating on the cursor date: the legacy
              daily BN for the eleven GHACOF events (2019–2024), and the
              medium-range network for nairobi_flood_2026 — the only scenario
              whose rounds fall inside it. No scenario JSON changes. */}
          {act > 1 && <BoundaryDagPanel expandable />}
          {act > 1 && <BoundaryCrmaMrPanel expandable />}
          {act > 1 && <BoundaryDagPanelDrought expandable />}
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
