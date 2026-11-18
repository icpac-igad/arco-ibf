'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';

export interface ScenarioCard {
  event_id: string;
  title: string;
  hazard: string;
  country: string;
  admin1: string;
  forecastability: string;
  offset_label: string;
  /** First / last round cursor (flood YYYY-MM-DD, drought YYYY-MM). */
  period_start: string;
  period_end: string;
  rounds: number;
  /** EM-DAT event this scenario replays, and its country ISO (GID_1 prefix):
   *  lets the Risk Knowledge entry match scenarios to the event being read. */
  emdat_event_key?: string;
  iso?: string;
}

type Filter = 'flood' | 'drought' | 'all';
const FILTERS: Filter[] = ['all', 'flood', 'drought'];
const LABEL: Record<Filter, string> = { flood: 'Flood', drought: 'Drought', all: 'All' };

/** Plain-language reading of the scenario's forecastability ("signal"),
 *  matching the wording used in the Act I quiz hints (app/lib/scenario/quiz.ts). */
const SIGNAL: Record<string, { label: string; text: string }> = {
  strong: {
    label: 'Strong signal',
    text: 'The forecast leads the impact with long lead time, so confident evidence deserves real weight.',
  },
  tail: {
    label: 'Tail-risk signal',
    text: 'The ensemble mean can look benign while a few members carry the danger — weigh the tail, not the average.',
  },
  surprise: {
    label: 'Surprise (low predictability)',
    text: 'Expect weak forecast warning — lean on observations as they arrive.',
  },
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2019-05-08" → "08 May 2019", "2021-01" → "Jan 2021" (string-only, no TZ shift). */
function fmt(iso: string): string {
  const [y, m, d] = iso.split('-');
  const mon = MONTH_NAMES[parseInt(m, 10) - 1];
  if (!y || !mon) return iso;
  return d ? `${d} ${mon} ${y}` : `${mon} ${y}`;
}

export function ScenarioBrowser({
  scenarios,
  initialFilter = 'flood',
}: {
  scenarios: ScenarioCard[];
  initialFilter?: Filter;
}) {
  // Flood is the default view (22 events otherwise clutter the list).
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const tabRefs = useRef<Record<Filter, HTMLButtonElement | null>>({ all: null, flood: null, drought: null });

  const counts: Record<Filter, number> = {
    flood: scenarios.filter((s) => s.hazard === 'flood').length,
    drought: scenarios.filter((s) => s.hazard === 'drought').length,
    all: scenarios.length,
  };
  const shown = scenarios.filter((s) => filter === 'all' || s.hazard === filter);

  // Segmented control = radio group: arrow keys move the selection.
  function onKey(e: React.KeyboardEvent, f: Filter) {
    const i = FILTERS.indexOf(f);
    let next: Filter | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = FILTERS[(i + 1) % FILTERS.length];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = FILTERS[(i - 1 + FILTERS.length) % FILTERS.length];
    if (next) {
      e.preventDefault();
      setFilter(next);
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <section className='scn-browser'>
      <header className='scn-browser__head'>
        <p className='ds-eyebrow'>CRMA · Scenario simulation</p>
        <h1 className='scn-browser__title'>Scenario Simulation</h1>
        <p className='scn-browser__lede'>
          Replay a past event as if it were unfolding today. Read the evidence as it
          arrives, weigh the uncertainty, and make a defensible DOC decision — deciding
          <em> not</em> to act, with reasons, can be the right call.
        </p>
        <p className='scn-browser__steps'>
          Each scenario runs in three acts: <strong>I · Understand</strong> the evidence,{' '}
          <strong>II · Update beliefs</strong> with the risk model round by round,{' '}
          <strong>III · Decide &amp; reflect</strong> against what actually happened.
        </p>
      </header>

      {/* Hazard filter — show only flood or drought (flood default), or all. */}
      <div className='scn-browser__bar'>
        <div className='scn-seg' role='radiogroup' aria-label='Filter scenarios by hazard'>
          {FILTERS.map((f) => {
            const on = filter === f;
            return (
              <button
                key={f}
                ref={(el) => {
                  tabRefs.current[f] = el;
                }}
                type='button'
                role='radio'
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                className={`scn-seg__opt${on ? ' is-on' : ''}`}
                onClick={() => setFilter(f)}
                onKeyDown={(e) => onKey(e, f)}
              >
                {f !== 'all' && <span className={`scn-hz-dot scn-hz-dot--${f}`} aria-hidden='true' />}
                {LABEL[f]} <span className='scn-seg__count'>({counts[f]})</span>
              </button>
            );
          })}
        </div>
        <p className='scn-browser__count' aria-live='polite'>
          {shown.length} {shown.length === 1 ? 'scenario' : 'scenarios'}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className='ds-card ds-state'>
          <p className='ds-state__title'>No scenarios for this hazard yet</p>
          <p>Choose another filter to see the available events.</p>
        </div>
      ) : (
        <ul className='scn-browser__grid'>
          {shown.map((s) => <ScenarioTile key={s.event_id} s={s} />)}
        </ul>
      )}
    </section>
  );
}

/** One scenario tile — shared by the scenario browser and the dashboard's
 *  scenario entry on the Risk Knowledge stage. `headingLevel` keeps the outline right. */
export function ScenarioTile({
  s,
  headingLevel = 2,
  tag,
}: {
  s: ScenarioCard;
  headingLevel?: 2 | 3;
  /** Optional relation to what the reader is looking at, e.g. "This event". */
  tag?: string;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const sig = SIGNAL[s.forecastability];
  const hz = s.hazard === 'flood' || s.hazard === 'drought' ? s.hazard : 'other';
  return (
    <li className={`ds-card scn-tile scn-tile--${hz}`}>
      <div className='scn-tile__top'>
        <span className={`scn-hz-badge scn-hz-badge--${hz}`}>
          <span className={`scn-hz-dot scn-hz-dot--${hz}`} aria-hidden='true' />
          {s.hazard === 'flood' ? 'Flood' : s.hazard === 'drought' ? 'Drought' : s.hazard}
        </span>
        {tag && <span className='ds-badge ds-badge--accent scn-tile__tag'>{tag}</span>}
        <span className='scn-tile__country'>{s.country}</span>
      </div>
      <Heading className='scn-tile__title'>{s.title}</Heading>
      <dl className='scn-tile__facts'>
        <div>
          <dt>Area</dt>
          <dd>{s.admin1}</dd>
        </div>
        <div>
          <dt>Period</dt>
          <dd>
            {fmt(s.period_start)} → {fmt(s.period_end)} · {s.rounds} rounds
          </dd>
        </div>
        <div>
          <dt>Starts</dt>
          <dd>{s.offset_label}</dd>
        </div>
        <div>
          <dt>Signal</dt>
          <dd>
            <strong>{sig ? sig.label : s.forecastability}</strong>
            {sig && <span className='scn-tile__signal'>{sig.text}</span>}
          </dd>
        </div>
      </dl>
      <div className='scn-tile__foot'>
        <Link
          className='ds-btn ds-btn--primary scn-btn-lg'
          href={`/scenario/${s.event_id}`}
          aria-label={`Start scenario: ${s.title}`}
        >
          Start scenario <span aria-hidden='true'>→</span>
        </Link>
      </div>
    </li>
  );
}
