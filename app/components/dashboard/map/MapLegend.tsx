'use client';

import React, { useId } from 'react';

export interface MapLegendItem {
  label: string;
  color: string;
}

export interface MapLegendSpec {
  title: string;
  /** One short plain-language line under the title (optional). */
  note?: string;
  items: MapLegendItem[];
}

/**
 * In-map legend (overlay, bottom-left). Purely presentational: the swatches are
 * built by DisasterMap from the SAME colour functions that fill the polygons,
 * so the legend cannot drift from the map. Collapsible; on narrow map cards it
 * is placed under the map instead of on it, so it never covers the data.
 */
export function MapLegend({
  spec,
  open,
  placement = 'overlay',
  onToggle,
}: {
  spec: MapLegendSpec;
  open: boolean;
  /** 'overlay' = bottom-left on the map; 'below' = under the map (narrow cards). */
  placement?: 'overlay' | 'below';
  onToggle: () => void;
}) {
  const bodyId = useId();
  return (
    <div className={`map-legend map-legend--${placement} ds-legend${open ? '' : ' map-legend--collapsed'}`}>
      <button
        type='button'
        className='map-legend__toggle'
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className='ds-legend__title'>{open ? spec.title : 'Legend'}</span>
        <svg aria-hidden='true' viewBox='0 0 16 16' width='14' height='14' className='map-legend__chev'>
          <path d='M4 10l4-4 4 4' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
        </svg>
        {!open && <span className='ds-visually-hidden'>: {spec.title}</span>}
      </button>
      <div id={bodyId} hidden={!open}>
        {spec.note && <p className='map-legend__note'>{spec.note}</p>}
        <ul className='ds-legend__items map-legend__items'>
          {spec.items.map((it) => (
            <li key={`${it.label}-${it.color}`} className='ds-legend__item'>
              <span className='ds-swatch' style={{ background: it.color }} aria-hidden='true' />
              {it.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
