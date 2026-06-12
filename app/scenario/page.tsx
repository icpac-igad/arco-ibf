'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface ScenarioSummary {
  event_id: string;
  title: string;
  hazard: string;
  country: string;
  forecastability: string;
}

export default function ScenarioLauncher() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/scenarios')
      .then((r) => r.json())
      .then((d) => setScenarios(d.scenarios ?? []))
      .catch(() => setError('Could not load scenarios'));
  }, []);

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Scenario Simulation</h1>
      <p style={{ color: '#555', marginBottom: '1.5rem' }}>
        From Forecast to Action — interactive DOC decision exercises built on
        historical East African drought and flood events.
      </p>
      {error && <p style={{ color: '#b50909' }}>{error}</p>}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
        }}
      >
        {scenarios.map((sc) => (
          <Link
            key={sc.event_id}
            href={`/scenario/${sc.event_id}`}
            style={{
              border: '1px solid #dfe1e2',
              borderRadius: 8,
              padding: '1rem',
              textDecoration: 'none',
              color: 'inherit',
              background: '#fff',
            }}
          >
            <div
              style={{
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                color: sc.hazard === 'flood' ? '#0050d8' : '#b45309',
                marginBottom: 4,
              }}
            >
              {sc.hazard} · {sc.country}
            </div>
            <div style={{ fontWeight: 600 }}>{sc.title}</div>
            <div style={{ fontSize: 13, color: '#71767a', marginTop: 4 }}>
              forecastability: {sc.forecastability}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
