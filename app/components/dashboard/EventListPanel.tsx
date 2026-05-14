'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchEmdatMonthlyRisk } from 'app/lib/api/emdat';
import type { EmdatMonthDatum } from 'app/types/emdat';

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

  return (
    <div className='card'>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>Events in {selectedMonth ?? '—'}</p>
          <h3>
            {selectedMonth
              ? eventsInMonth.length === 0
                ? 'No events for this month'
                : `${eventsInMonth.length} event${eventsInMonth.length === 1 ? '' : 's'} — pick one to view MDX`
              : 'Pick a month from the calendar'}
          </h3>
        </div>
        {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
      </div>

      {eventsInMonth.length > 0 && (
        <ul className='event-list' style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {eventsInMonth.map((evt) => {
            const active = evt.event_key === selectedEventKey;
            return (
              <li key={evt.event_key} style={{ marginBottom: '0.25rem' }}>
                <button
                  type='button'
                  onClick={() => setSelectedEventKey(evt.event_key)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.5rem 0.75rem',
                    border: active ? '1px solid #1d4ed8' : '1px solid #e5e7eb',
                    background: active ? '#eff6ff' : '#ffffff',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  <span style={{ fontFamily: 'ui-monospace, monospace', color: '#374151' }}>
                    {evt.event_key}
                  </span>
                  <span style={{ color: '#6b7280', marginLeft: '0.75rem' }}>
                    events: {evt.event_count}
                    {evt.total_deaths
                      ? ` · deaths: ${evt.total_deaths.toLocaleString()}`
                      : ''}
                    {evt.total_affected
                      ? ` · affected: ${evt.total_affected.toLocaleString()}`
                      : ''}
                    {evt.regions_affected
                      ? ` · admin1: ${evt.regions_affected}`
                      : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
