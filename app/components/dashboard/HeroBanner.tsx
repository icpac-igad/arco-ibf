'use client';

import React from 'react';
import { TopBar } from 'app/components/shell/TopBar';
import { usePipelineStore } from 'app/store/providers/pipeline';
import type { DisasterType } from 'app/types/emdat';

// Selectable hazards — these drive the dashboard below, like the chip row did.
const HAZARDS: { id: DisasterType; label: string; meta: string }[] = [
  { id: 'flood', label: 'Flood', meta: 'daily CRMA outlook' },
  { id: 'drought', label: 'Drought', meta: 'monthly BN outlook' },
];

// Standing facts about coverage. Not controls — there is nothing to switch to.
// "EM-DAT events" used to ride on both hazard labels; it is shared by both
// hazards, so it is stated once here.
const FACTS: [string, string][] = [
  ['East Africa', 'regional coverage'],
  ['EM-DAT', 'recorded events'],
  ['Admin-1', 'choropleths'],
  ['IBF', 'impact-based forecasts'],
];

/**
 * The atmosphere zone, ported from the MUST toolkit's hero: a dark full-bleed
 * band under an ink scrim, the masthead over it, and a rail on the boundary.
 *
 * On the dashboard the band is deliberately compact (`sky--compact`): one-line
 * title, one-line lede, slim rail — so the operational view (date, lead time,
 * calendar, map) starts within the first screen of a 1440x900 laptop.
 *
 * MUST's rail is a read-only ticker. Here it carries the hazard selector, so
 * the band is a control surface rather than decoration.
 *
 * MUST cross-fades photography behind this. CRMA has no banner imagery of its
 * own, so the backdrop is a gradient built from the ink tokens — swap in
 * <Image> once there are licensed photographs to use.
 */
export function HeroBanner() {
  const { hazard, setHazard } = usePipelineStore();

  return (
    <section className='sky sky--compact'>
      <div className='sky__scrim' aria-hidden='true' />

      <TopBar />

      <div className='hero'>
        <div className='hero-title'>
          <h1 className='sky__h1'>
            Continuous Risk{' '}
            <span className='sky__h1-accent'>Monitoring &amp; Assessment</span>
          </h1>
          <p className='sky__lede'>
            Explore disaster events, monitor hazard risk, and access impact-based
            forecasts for flood and drought across East Africa.
          </p>
        </div>
      </div>

      <div className='rail'>
        <div className='rail__in'>
          <div className='rail__group' role='group' aria-labelledby='rail-label-hazard'>
            <span className='rail__label' id='rail-label-hazard'>
              Hazard
            </span>
            {HAZARDS.map((item) => {
              const active = hazard === item.id;
              return (
                <button
                  key={item.id}
                  type='button'
                  className={`rail-pick ${active ? 'is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => setHazard(item.id)}
                >
                  <span className='rail-pick__dot' aria-hidden='true' />
                  <strong className='ticker-value'>{item.label}</strong>
                  <span className='ticker-label'>{item.meta}</span>
                </button>
              );
            })}
          </div>

          <ul className='rail__facts' aria-label='Coverage'>
            {FACTS.map(([value, label]) => (
              <li className='ticker-item' key={value}>
                <span className='ticker-badge' aria-hidden='true' />
                <strong className='ticker-value'>{value}</strong>
                <span className='ticker-label'>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
