'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export interface ScenarioCard {
  event_id: string;
  title: string;
  hazard: string;
  country: string;
  admin1: string;
  forecastability: string;
  offset_label: string;
}

type Filter = 'flood' | 'drought' | 'all';
const FILTERS: Filter[] = ['flood', 'drought', 'all'];
const LABEL: Record<Filter, string> = { flood: 'Flood', drought: 'Drought', all: 'All' };

export function ScenarioBrowser({ scenarios }: { scenarios: ScenarioCard[] }) {
  // Flood is the default view (22 events otherwise clutter the list).
  const [filter, setFilter] = useState<Filter>('flood');

  const counts: Record<Filter, number> = {
    flood: scenarios.filter((s) => s.hazard === 'flood').length,
    drought: scenarios.filter((s) => s.hazard === 'drought').length,
    all: scenarios.length,
  };
  const shown = scenarios.filter((s) => filter === 'all' || s.hazard === filter);

  return (
    <section className='grid-row margin-top-4'>
      <div className='tablet:grid-col-12'>
        <p className='eyebrow'>CRMA · Risk Decisions</p>
        <h1>Scenario Simulation</h1>
        <p className='text-base'>
          Replay a past event as if it were unfolding today. Read the evidence as it
          arrives, weigh the uncertainty, and make a defensible DOC decision — deciding
          <em> not</em> to act, with reasons, can be the right call.
        </p>

        {/* Hazard filter — show only flood or drought (flood default), or all. */}
        <div className='margin-y-2' role='group' aria-label='Filter scenarios by hazard'>
          {FILTERS.map((f) => (
            <button
              key={f}
              type='button'
              className={`usa-button ${filter === f ? '' : 'usa-button--outline'}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {LABEL[f]} ({counts[f]})
            </button>
          ))}
        </div>

        <ul className='usa-card-group'>
          {shown.map((s) => (
            <li key={s.event_id} className='usa-card tablet:grid-col-6'>
              <div className='usa-card__container'>
                <div className='usa-card__header'>
                  <h3 className='usa-card__heading'>{s.title}</h3>
                </div>
                <div className='usa-card__body'>
                  <p>
                    <strong>{s.hazard}</strong> · {s.country} — {s.admin1}
                  </p>
                  <p className='text-base-dark'>
                    Signal: {s.forecastability} · starts {s.offset_label}
                  </p>
                </div>
                <div className='usa-card__footer'>
                  <Link className='usa-button' href={`/scenario/${s.event_id}`}>
                    Start simulation
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
