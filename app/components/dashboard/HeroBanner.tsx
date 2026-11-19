'use client';

import React from 'react';
import { TopBar } from 'app/components/shell/TopBar';

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
 * ICPAC look (after floodwatch.icpac.net), all in ICPAC green: the title and
 * lede, one control panel (hazard / stage / time period / lead time, labels in
 * one column), then the coverage facts as a row of pills along the bottom.
 *
 * MUST cross-fades photography behind this. CRMA has no banner imagery of its
 * own, so the backdrop is a gradient built from the ink tokens — swap in
 * <Image> once there are licensed photographs to use.
 */
export function HeroBanner({
  controls,
  note,
}: {
  /** Hazard, stage, date and lead time: one aligned row in the hero panel. */
  controls?: React.ReactNode;
  /** One-line description of what the stage shows, under the panel. */
  note?: React.ReactNode;
}) {
  return (
    <section className='sky sky--compact'>
      <div className='sky__scrim' aria-hidden='true' />

      <TopBar />

      <div className='hero hero--plain'>
        <div className='hero-top'>
          <div className='hero-top__text'>
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
        {controls && (
          <div className='hero-controls hero-panel'>
            {controls}
            {note && <div className='hero-panel__note'>{note}</div>}
          </div>
        )}
        {/* Coverage facts as a row of pills along the bottom of the hero. */}
        <ul className='hero-pills' aria-label='Coverage'>
          {FACTS.map(([value, label]) => (
            <li className='hero-pill' key={value}>
              <span className='hero-pill__dot' aria-hidden='true' />
              <strong>{value}</strong>
              <span className='hero-pill__label'>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
