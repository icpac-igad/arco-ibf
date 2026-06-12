'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ScenarioChat } from 'app/components/scenario/ScenarioChat';

interface EvidenceCard {
  id: string;
  label: string;
  source?: string;
  bn_node: string;
  evidence_type: 'hard' | 'soft' | 'virtual';
  value_by_date: Record<string, string>;
  teaching_note?: string;
}

interface Round {
  round: number;
  title: string;
  cursor_date: string;
  reveal_evidence: string[];
  checkpoint: boolean;
  engine_state?: string;
}

interface Scenario {
  event_id: string;
  title: string;
  hazard: string;
  country: string;
  admin1: string;
  brief_outcome_free: string;
  rounds: Round[];
  evidence_cards: EvidenceCard[];
  decision: {
    ladder: string[];
    checkpoint_prompt: string;
  };
}

const TYPE_COLORS: Record<string, string> = {
  hard: '#1a7f37',
  soft: '#b45309',
  virtual: '#6f42c1',
};

function valueAt(card: EvidenceCard, cursor: string): string | null {
  const dated = Object.entries(card.value_by_date ?? {})
    .filter(([d]) => d <= cursor)
    .sort(([a], [b]) => a.localeCompare(b));
  return dated.length ? dated[dated.length - 1][1] : null;
}

export default function ScenarioRunner() {
  const { eventId } = useParams<{ eventId: string }>();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roundIdx, setRoundIdx] = useState(0); // 0-based index into rounds
  const [debrief, setDebrief] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/scenarios/${eventId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'load failed');
        return r.json();
      })
      .then(setScenario)
      .catch((e) => setError(String(e.message ?? e)));
  }, [eventId]);

  const round = scenario?.rounds[roundIdx];
  const revealed = useMemo(() => {
    if (!scenario || !round) return [];
    const ids = scenario.rounds
      .slice(0, roundIdx + 1)
      .flatMap((r) => r.reveal_evidence);
    const byId = new Map(scenario.evidence_cards.map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as EvidenceCard[];
  }, [scenario, round, roundIdx]);

  if (error) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <p style={{ color: '#b50909' }}>{error}</p>
        <Link href='/scenario'>← Back to scenarios</Link>
      </main>
    );
  }
  if (!scenario || !round) {
    return <main style={{ padding: '2rem' }}>Loading scenario…</main>;
  }

  const lastRound = roundIdx === scenario.rounds.length - 1;

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <Link href='/scenario' style={{ fontSize: 13 }}>
        ← All scenarios
      </Link>
      <h1 style={{ margin: '0.25rem 0' }}>{scenario.title}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>{scenario.brief_outcome_free}</p>

      {/* Round stepper */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '1rem 0' }}>
        {scenario.rounds.map((r, i) => (
          <button
            key={r.round}
            onClick={() => {
              setRoundIdx(i);
              if (i < scenario.rounds.length - 1) setDebrief(false);
            }}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: 20,
              border: '1px solid',
              borderColor: i === roundIdx ? '#005ea2' : '#dfe1e2',
              background: i === roundIdx ? '#005ea2' : i < roundIdx ? '#e7f2f9' : '#fff',
              color: i === roundIdx ? '#fff' : '#1b1b1b',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            R{r.round} · {r.cursor_date}
          </button>
        ))}
        <button
          onClick={() => {
            setRoundIdx(scenario.rounds.length - 1);
            setDebrief(true);
          }}
          disabled={!lastRound && !debrief}
          title={lastRound ? '' : 'Reach the final round first'}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: 20,
            border: '1px solid',
            borderColor: debrief ? '#6f42c1' : '#dfe1e2',
            background: debrief ? '#6f42c1' : '#fff',
            color: debrief ? '#fff' : lastRound ? '#1b1b1b' : '#a9aeb1',
            cursor: lastRound ? 'pointer' : 'default',
            fontSize: 13,
          }}
        >
          Debrief
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.25rem' }}>
        <div>
          {/* Current round panel */}
          <div
            style={{
              border: '1px solid #dfe1e2',
              borderRadius: 8,
              padding: '1rem',
              background: '#fff',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontSize: 12, color: '#71767a' }}>
              Simulation cursor: <strong>{round.cursor_date}</strong>
            </div>
            <h2 style={{ margin: '0.25rem 0', fontSize: 18 }}>{round.title}</h2>
            {round.engine_state && (
              <p style={{ margin: '0.25rem 0', fontSize: 14, color: '#555' }}>
                {round.engine_state}
              </p>
            )}
            {round.checkpoint && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  borderLeft: '4px solid #005ea2',
                  background: '#e7f2f9',
                  fontSize: 14,
                }}
              >
                <strong>Decision checkpoint.</strong> {scenario.decision.checkpoint_prompt}
                <div style={{ marginTop: 6, fontSize: 13, color: '#555' }}>
                  Ladder: {scenario.decision.ladder.join(' → ')}
                </div>
              </div>
            )}
          </div>

          {/* Evidence cards */}
          <h3 style={{ fontSize: 15, margin: '0 0 0.5rem' }}>
            Evidence revealed ({revealed.length})
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {revealed.map((card) => {
              const v = valueAt(card, round.cursor_date);
              return (
                <div
                  key={card.id}
                  style={{
                    border: '1px solid #dfe1e2',
                    borderRadius: 8,
                    padding: '0.75rem',
                    background: '#fff',
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: '#fff',
                      background: TYPE_COLORS[card.evidence_type] ?? '#555',
                      borderRadius: 4,
                      padding: '1px 6px',
                      marginBottom: 6,
                    }}
                  >
                    {card.evidence_type}
                  </span>
                  <div style={{ fontWeight: 600 }}>{card.label}</div>
                  <div style={{ color: '#71767a', marginTop: 2 }}>
                    BN node: <code>{card.bn_node}</code>
                  </div>
                  {v && (
                    <div style={{ marginTop: 6 }}>
                      Value at {round.cursor_date}: <strong>{v}</strong>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
            {roundIdx > 0 && (
              <button
                onClick={() => setRoundIdx(roundIdx - 1)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  border: '1px solid #dfe1e2',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                ← Previous round
              </button>
            )}
            {!lastRound && (
              <button
                onClick={() => setRoundIdx(roundIdx + 1)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  border: 'none',
                  background: '#005ea2',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Advance to round {scenario.rounds[roundIdx + 1].round} →
              </button>
            )}
            {lastRound && !debrief && (
              <button
                onClick={() => setDebrief(true)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  border: 'none',
                  background: '#6f42c1',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Open debrief →
              </button>
            )}
          </div>
        </div>

        {/* Chat assistant */}
        <ScenarioChat
          scenarioId={scenario.event_id}
          round={round.round}
          debrief={debrief}
        />
      </div>
    </main>
  );
}
