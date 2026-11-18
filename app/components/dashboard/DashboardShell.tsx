'use client';

import React from 'react';
import Link from 'next/link';
import { PipelineProvider, usePipelineStore } from 'app/store/providers/pipeline';
import { getCalendarConfig, type PipelineStage } from 'app/types/pipeline';
import { isMrInit } from 'app/lib/crma-mr-range';
import { HeroBanner } from './HeroBanner';
import { PipelineChips } from './PipelineChips';
import { WindowChips } from './WindowChips';
import { DisasterCalendar } from './DisasterCalendar';
import { DisasterMap } from './DisasterMap';
import { MarkdownPanel } from './MarkdownPanel';
import { StagePanels } from './StagePanels';
import { BoundaryDagPanel } from './BoundaryDagPanel';
import { BoundaryCrmaMrPanel } from './BoundaryCrmaMrPanel';
import { BoundaryDagPanelDrought } from './BoundaryDagPanelDrought';
import { EventListPanel } from './EventListPanel';
import { ScenarioTile, type ScenarioCard } from 'app/scenario/ScenarioBrowser';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STAGE_NAME: Record<PipelineStage, string> = {
  'risk-knowledge': 'Risk Knowledge',
  'risk-monitoring': 'Risk Monitoring',
  'risk-decisions': 'Risk Decisions',
};

/** "2026-02-04" -> "04 Feb 2026", "2026-02" -> "Feb 2026". String-only: no Date, no timezone. */
function formatSelected(value: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!m) return value;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return m[3] ? `${m[3]} ${month} ${m[1]}` : `${month} ${m[1]}`;
}

function CalendarIcon() {
  return (
    <svg className='dash-date__icon' viewBox='0 0 16 16' aria-hidden='true' focusable='false'>
      <rect x='1.75' y='2.75' width='12.5' height='11.5' rx='2' fill='none' stroke='currentColor' strokeWidth='1.5' />
      <path d='M1.75 6.25h12.5M5 1.25v3M11 1.25v3' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
    </svg>
  );
}

/**
 * The selected date/month. Read-only here: it is chosen by clicking a cell in
 * the calendar, which the hint says in words (not only in a tooltip).
 */
function SelectedDate({ value, mode }: { value: string | null | undefined; mode: string }) {
  const unit = mode === 'monthly' ? 'month' : 'day';
  return (
    <div className='dash-control dash-date' aria-live='polite'>
      <span className='dash-control__label' id='dash-label-date'>
        {/* Follow the value, not only the mode: the decisions calendar can
            hold a month (e.g. "2026-12") even though it is a daily calendar. */}
        {value ? (value.length === 10 ? 'Date' : 'Month') : mode === 'monthly' ? 'Month' : 'Date'}
      </span>
      <span className='dash-date__stack'>
        {value ? (
          <span className='dash-date__value'>
            <CalendarIcon />
            <strong>{formatSelected(value)}</strong>
          </span>
        ) : (
          <span className='dash-date__value dash-date__value--empty'>
            <CalendarIcon />
            None selected
          </span>
        )}
        <span className='dash-date__hint'>Pick a {unit} in the calendar</span>
      </span>
    </div>
  );
}

/**
 * Current selection, shown in the console bar. Display only — every value is
 * read from the store; nothing here changes state.
 */
function ConsoleSelection() {
  const { hazard, stage, selectedMonth, selectedWindow, selectedBoundary, selectedEventKey } =
    usePipelineStore();
  const lead = hazard === 'flood' && stage === 'risk-monitoring' && isMrInit(selectedMonth);
  const items: { k: string; v: string; mono?: boolean }[] = [];
  if (selectedMonth) items.push({ k: selectedMonth.length === 10 ? 'Date' : 'Month', v: formatSelected(selectedMonth) });
  if (lead && selectedWindow) items.push({ k: 'Lead', v: selectedWindow });
  if (stage === 'risk-knowledge' && selectedEventKey) items.push({ k: 'Event', v: selectedEventKey, mono: true });
  // Region is shown by name (with a clear ×) in the map header chip; a raw GID here duplicated it.

  return (
    <div className='dash-console__sel'>
      <span className='ds-visually-hidden'>Current selection:</span>
      {items.length === 0 ? (
        <span className='dash-console__sel-empty'>Nothing selected — click a calendar cell, then a region on the map</span>
      ) : (
        items.map((it) => (
          <span key={it.k} className='ds-badge dash-console__chip'>
            <span className='dash-console__chip-k'>{it.k}</span>
            <span className={it.mono ? 'dash-console__chip-v is-mono' : 'dash-console__chip-v'}>{it.v}</span>
          </span>
        ))
      )}
    </div>
  );
}

/** Risk Decisions: a short, varied pick of scenarios + a link to all of them. */
function DecisionScenarios({ scenarios, hazard }: { scenarios: ScenarioCard[]; hazard: string }) {
  const forHazard = scenarios.filter((s) => s.hazard === hazard);
  // The three most recent events, each from a different country, so a group
  // sees variety (every flood scenario shares one signal type, every drought
  // scenario another, so signal can't be the spread). The full list is one click.
  const picked: ScenarioCard[] = [];
  [...forHazard]
    .sort((a, b) => b.period_start.localeCompare(a.period_start))
    .forEach((s) => {
      if (picked.length < 3 && !picked.some((p) => p.country === s.country)) picked.push(s);
    });
  const hz = hazard === 'drought' ? 'drought' : 'flood';

  return (
    <section className='ds-card dash-decisions' aria-labelledby='dash-decisions-title'>
      <div className='dash-decisions__head'>
        <div className='dash-decisions__text'>
          <p className='ds-eyebrow'>Risk decisions · Scenario simulation</p>
          <h2 className='ds-card__title' id='dash-decisions-title'>
            Rehearse a {hz} decision on a past event
          </h2>
          <p className='ds-note'>
            Replay a past event as if it were unfolding today: read the evidence round by
            round, weigh the uncertainty, and log a decision you can defend.
          </p>
        </div>
        <Link className='ds-btn ds-btn--secondary dash-decisions__all' href={`/scenario?hazard=${hz}`}>
          All {forHazard.length} {hz} scenarios <span aria-hidden='true'>→</span>
        </Link>
      </div>
      {picked.length > 0 ? (
        <ul className='scn-browser__grid dash-decisions__grid'>
          {picked.map((s) => <ScenarioTile key={s.event_id} s={s} headingLevel={3} />)}
        </ul>
      ) : (
        <div className='ds-state'>
          <p className='ds-state__title'>No {hz} scenarios yet</p>
          <Link className='ds-btn ds-btn--primary' href='/scenario?hazard=all'>
            Browse all scenarios <span aria-hidden='true'>→</span>
          </Link>
        </div>
      )}
    </section>
  );
}

function DashboardContent({ scenarios }: { scenarios: ScenarioCard[] }) {
  const { stage, hazard, selectedMonth } = usePipelineStore();
  const calendarConfig = getCalendarConfig(stage, hazard);
  const hazardName = hazard === 'drought' ? 'Drought' : 'Flood';
  const period = `${calendarConfig.mode === 'daily' ? 'Daily' : 'Monthly'}, ${
    calendarConfig.startYear === calendarConfig.endYear
      ? calendarConfig.startYear
      : `${calendarConfig.startYear}–${calendarConfig.endYear}`
  }`;

  return (
    <>
    {/* MUST hero (compact on the dashboard): masthead + hazard selector on the rail. */}
    <HeroBanner />
    <div className='pipeline-shell grid-container-widescreen dash-shell'>

      {/* One compact control bar: stage (mode), selected date, then lead time
          (flood risk-monitoring only) on one row, and a one-line description. */}
      <div className='dash-controlbar'>
        <div className='dash-controlbar__row'>
          <PipelineChips />
          {/* Risk Decisions has no calendar, so no date to show. */}
          {stage !== 'risk-decisions' && (
            <>
              <span className='dash-controlbar__sep' aria-hidden='true' />
              <SelectedDate value={selectedMonth} mode={calendarConfig.mode} />
            </>
          )}
          {/* Renders null outside flood risk-monitoring. */}
          <WindowChips />
        </div>
        <StagePanels />
      </div>

      {/* Risk Decisions is its own stage: decisions are rehearsed on past
          events, so it shows a few scenarios for the current hazard (one per
          kind of forecast signal) and a way into the full scenario list —
          not the calendar and map, which carry no decision data. */}
      {stage === 'risk-decisions' && <DecisionScenarios scenarios={scenarios} hazard={hazard} />}

      {/* Operational console: calendar + map in ONE card under a shared bar.
          Side by side from 1024px; stacked (map second) below. */}
      {stage !== 'risk-decisions' && (
      <section className='ds-card dash-console' aria-labelledby='dash-console-title'>
        <header className='dash-console__bar'>
          <div className='dash-console__head'>
            <p className='ds-eyebrow'>
              {hazardName} · {STAGE_NAME[stage]} · {period}
            </p>
            <h2 className='ds-card__title' id='dash-console-title'>
              Calendar &amp; map
            </h2>
          </div>
          <ConsoleSelection />
        </header>
        <div className='dash-console__body'>
          <div className='dash-console__pane dash-console__pane--cal'>
            <DisasterCalendar
              mode={calendarConfig.mode}
              startYear={calendarConfig.startYear}
              endYear={calendarConfig.endYear}
            />
            {/* Risk Knowledge: the month's EM-DAT events sit right under the
                calendar and beside the map, so picking one draws its regions
                next to it. Renders null on the other stages. */}
            <EventListPanel />
            {/* Monitoring / decisions: the date's narrative fills the column
                under the calendar, beside the region detail under the map. */}
            {stage !== 'risk-knowledge' && <MarkdownPanel />}
          </div>
          <div className='dash-console__pane dash-console__pane--map'>
            <DisasterMap />
            {/* Risk Knowledge: the picked event's storyline sits under its map,
                same width — calendar, events, map and story read as one unit. */}
            {stage === 'risk-knowledge' && <MarkdownPanel />}
            {/* Monitoring / decisions: the clicked region's detail sits under
                the map, same width, so the answer appears beside the click.
                Each panel renders null when its hazard/stage does not match;
                the wrapper hides itself when all do (CSS :empty). The
                diagram stays expandable to a full-screen copy. */}
            {stage !== 'risk-knowledge' && (
              <div className='dash-console__detail' role='region' aria-label='Selected region in detail'>
                <BoundaryDagPanel expandable />
                <BoundaryCrmaMrPanel expandable />
                <BoundaryDagPanelDrought expandable />
              </div>
            )}
          </div>
        </div>
      </section>
      )}


    </div>
    </>
  );
}

export function DashboardShell({ scenarios = [] }: { scenarios?: ScenarioCard[] }) {
  return (
    <PipelineProvider>
      <DashboardContent scenarios={scenarios} />
    </PipelineProvider>
  );
}
