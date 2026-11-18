'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchEmdatMonthlyRisk } from 'app/lib/api/emdat';
import type { EmdatMonthDatum } from 'app/types/emdat';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1990-04" -> "Apr 1990". String-only: no Date, no timezone. */
function formatMonth(value: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/**
 * EventListPanel
 *
 * Shown at risk-knowledge between the map and the MarkdownPanel when the user
 * has picked a month. Lists every EM-DAT event in that month for the current
 * hazard, sorted by event_count desc. Clicking an event sets the URL's
 * ?event= param, which the MarkdownPanel watches to fetch the right MDX.
 *
 * Months that have 0 events never trigger this panel because the calendar
 * click handler is a no-op on empty cells.
 */
export function EventListPanel() {
  const { hazard, stage, selectedMonth, selectedEventKey, setSelectedEventKey } =
    usePipelineStore();
  const [allEvents, setAllEvents] = useState<EmdatMonthDatum[]>([]);
  const [loading, setLoading] = useState(false);

  // Pull the full year×month roster once per hazard; filter client-side.
  // This is the same payload DisasterCalendar already fetches, so the
  // round-trip is duplicated — acceptable given the payload is small
  // (~80 drought / ~368 flood rows).
  useEffect(() => {
    if (stage !== 'risk-knowledge') return;
    let cancelled = false;
    setLoading(true);
    fetchEmdatMonthlyRisk(hazard)
      .then((rows) => { if (!cancelled) setAllEvents(rows); })
      .catch((err) => console.error('EM-DAT event list fetch failed', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hazard, stage]);

  const eventsInMonth = useMemo(() => {
    if (!selectedMonth) return [];
    const [yStr, mStr] = selectedMonth.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    return allEvents
      .filter((e) => e.year === year && e.month === month)
      .sort((a, b) => b.event_count - a.event_count);
  }, [allEvents, selectedMonth]);

  if (stage !== 'risk-knowledge') return null;

  const monthLabel = selectedMonth ? formatMonth(selectedMonth) : null;

  return (
    <div className='ds-card dash-events'>
      <div className='ds-card__header'>
        <div>
          <p className='ds-eyebrow'>EM-DAT disasters{monthLabel ? ` · ${monthLabel}` : ''}</p>
          <h3 className='ds-card__title'>
            {selectedMonth
              ? eventsInMonth.length === 0
                ? loading
                  ? 'Loading events…'
                  : 'No disasters recorded this month'
                : `${eventsInMonth.length} disaster${eventsInMonth.length === 1 ? '' : 's'} — pick one to read its storyline`
              : 'Disasters in the selected month'}
          </h3>
        </div>
        {loading && (
          <span className='ds-badge ds-badge--info' role='status'>
            <span className='ds-spinner dash-events__spin' aria-hidden='true' />
            Loading
          </span>
        )}
      </div>

      {!selectedMonth && (
        <div className='ds-state'>
          <p className='ds-state__title'>No month selected</p>
          <p className='ds-note'>Pick a month in the calendar to list its EM-DAT events.</p>
        </div>
      )}

      {selectedMonth && !loading && eventsInMonth.length === 0 && (
        <div className='ds-state'>
          <p className='ds-state__title'>No recorded events</p>
          <p className='ds-note'>EM-DAT has no {hazard} events for {monthLabel}.</p>
        </div>
      )}

      {eventsInMonth.length > 0 && (
        <ul className='dash-events__list' aria-label={`EM-DAT events in ${monthLabel ?? ''}`}>
          {eventsInMonth.map((evt) => {
            const active = evt.event_key === selectedEventKey;
            return (
              <li key={evt.event_key}>
                <button
                  type='button'
                  className={`dash-events__item${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => setSelectedEventKey(evt.event_key)}
                >
                  <span className='dash-events__key'>{evt.event_key}</span>
                  <span className='dash-events__stats'>
                    {evt.total_deaths ? (
                      <span className='ds-badge ds-badge--danger'>
                        deaths: {evt.total_deaths.toLocaleString()}
                      </span>
                    ) : null}
                    {evt.total_affected ? (
                      <span className='ds-badge ds-badge--warning'>
                        affected: {evt.total_affected.toLocaleString()}
                      </span>
                    ) : null}
                    {evt.regions_affected ? (
                      <span className='ds-badge ds-badge--info'>
                        regions affected: {evt.regions_affected}
                      </span>
                    ) : null}
                  </span>
                  {active && <span className='dash-events__current'>On the map</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
