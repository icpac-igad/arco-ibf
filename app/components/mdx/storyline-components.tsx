'use client';

// Presentation-only overrides for the EM-DAT storyline MDX (UI/UX pass).
// The MDX itself is unchanged; these components only change how two of its
// generated blocks read to a non-specialist:
//  - the "Impact Summary" pipe table (stored as plain text because the MDX
//    build has no GFM tables) becomes a real two-column table with plain labels;
//  - the "Affected Admin1 Regions" list of GID codes (KEN.12_1 …) becomes
//    named region chips grouped by country, using the same admin-1 file the map
//    loads (/icpac_adm1v3.json, GID_1 → NAME_1).

import React, { useEffect, useState } from 'react';
import { loadAdm1Topology } from 'app/lib/hooks/useAdm1Topology';

const COUNTRY_NAMES: Record<string, string> = {
  BDI: 'Burundi', DJI: 'Djibouti', ERI: 'Eritrea', ETH: 'Ethiopia', KEN: 'Kenya',
  RWA: 'Rwanda', SDN: 'Sudan', SOM: 'Somalia', SSD: 'South Sudan', TZA: 'Tanzania',
  UGA: 'Uganda',
};

// Plain-language labels for the metric rows; unknown rows pass through.
const METRIC_LABELS: Record<string, string> = {
  'total affected': 'People affected',
  affected: 'People affected',
  deaths: 'Deaths',
  'total deaths': 'Deaths',
  displaced: 'People displaced',
  injured: 'People injured',
  homeless: 'People left homeless',
  'admin1 regions': 'Regions affected',
  'admin-1 regions': 'Regions affected',
};

const HEADING_LABELS: Record<string, string> = {
  'impact summary': 'Impact in numbers',
  'affected admin1 regions': 'Where it happened',
  'affected admin-1 regions': 'Where it happened',
};

const GID_RE = /^[A-Z]{3}\.\d+_\d+$/;

// ── admin-1 names, loaded once per page ─────────────────────────────────────
let namesPromise: Promise<Map<string, string>> | null = null;
function loadRegionNames(): Promise<Map<string, string>> {
  if (!namesPromise) {
    // Shares the dashboard maps' single fetch + parse of the admin-1 TopoJSON.
    namesPromise = loadAdm1Topology()
      .then(({ topology: topo }) => {
        const m = new Map<string, string>();
        Object.values<any>(topo?.objects ?? {}).forEach((obj) =>
          (obj?.geometries ?? []).forEach((g: any) => {
            const p = g?.properties;
            if (p?.GID_1 && p?.NAME_1) m.set(String(p.GID_1), String(p.NAME_1));
          }),
        );
        return m;
      })
      .catch(() => {
        namesPromise = null; // allow a retry on the next storyline
        return new Map<string, string>();
      });
  }
  return namesPromise;
}

function useRegionNames() {
  const [names, setNames] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    loadRegionNames().then((m) => live && setNames(m));
    return () => { live = false; };
  }, []);
  return names;
}

// ── helpers ─────────────────────────────────────────────────────────────────
const textOf = (node: React.ReactNode): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
};

function parsePipeTable(text: string): string[][] | null {
  const lines = text.trim().split('\n').map((l) => l.trim());
  if (lines.length < 2 || !lines.every((l) => l.startsWith('|') && l.endsWith('|'))) return null;
  const rows = lines
    .filter((l) => !/^\|[\s:|-]+\|$/.test(l)) // drop the |---|---| separator
    .map((l) => l.slice(1, -1).split('|').map((c) => c.trim()));
  return rows.length ? rows : null;
}

// ── overrides ───────────────────────────────────────────────────────────────
function StoryParagraph({ children, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  const text = typeof children === 'string' ? children : null;
  const rows = text ? parsePipeTable(text) : null;
  if (!rows) return <p {...rest}>{children}</p>;

  const [head, ...body] = rows;
  const isMetricValue = head.length === 2 && /metric/i.test(head[0]) && /value/i.test(head[1]);
  return (
    <table className='story-facts'>
      {!isMetricValue && (
        <thead>
          <tr>{head.map((h, i) => <th key={i} scope='col'>{h}</th>)}</tr>
        </thead>
      )}
      <tbody>
        {body.map((r, i) => (
          <tr key={i}>
            <th scope='row'>{METRIC_LABELS[r[0]?.toLowerCase()] ?? r[0]}</th>
            {r.slice(1).map((c, j) => <td key={j}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StoryHeading({ children, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  const label = HEADING_LABELS[textOf(children).trim().toLowerCase()];
  return <h2 {...rest}>{label ?? children}</h2>;
}

function RegionChips({ gids }: { gids: string[] }) {
  const names = useRegionNames();
  const byCountry = new Map<string, string[]>();
  gids.forEach((g) => {
    const iso = g.split('.')[0];
    byCountry.set(iso, [...(byCountry.get(iso) ?? []), g]);
  });
  return (
    <div className='story-regions'>
      <p className='story-regions__note'>
        {gids.length} {gids.length === 1 ? 'region' : 'regions'} (counties, districts or states),
        shaded on the map.
      </p>
      {Array.from(byCountry.entries()).map(([iso, list]) => {
        const labelled = list
          .map((g) => ({ gid: g, name: names?.get(g) ?? null }))
          .sort((a, b) => (a.name ?? a.gid).localeCompare(b.name ?? b.gid));
        return (
          <div key={iso} className='story-regions__group'>
            {byCountry.size > 1 && <p className='story-regions__country'>{COUNTRY_NAMES[iso] ?? iso}</p>}
            <ul className='story-regions__list' aria-label={`Affected regions in ${COUNTRY_NAMES[iso] ?? iso}`}>
              {labelled.map(({ gid, name }) => (
                <li key={gid} className='story-regions__chip' title={gid}>
                  {name ?? (names ? gid : '…')}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function StoryList({ children, ...rest }: React.HTMLAttributes<HTMLUListElement>) {
  const items = React.Children.toArray(children).filter(React.isValidElement);
  const gids = items.map((li) => textOf(li).trim());
  if (gids.length > 0 && gids.every((g) => GID_RE.test(g))) return <RegionChips gids={gids} />;
  return <ul {...rest}>{children}</ul>;
}

export const storylineComponents = {
  p: StoryParagraph,
  h2: StoryHeading,
  ul: StoryList,
};
