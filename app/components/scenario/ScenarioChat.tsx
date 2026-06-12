'use client';

import React, { useEffect, useRef, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ScenarioChatProps {
  scenarioId: string;
  round: number;
  debrief: boolean;
  bnState?: Record<string, unknown> | null;
}

/**
 * LLM explanatory assistant for the scenario simulation (Act II).
 * Sends the conversation plus simulation position to /api/scenario-chat;
 * the backend injects round-gated scenario context into the system prompt.
 */
export function ScenarioChat({ scenarioId, round, debrief, bnState }: ScenarioChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput('');
    const history = messages;
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const res = await fetch('/api/scenario-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: scenarioId,
          round,
          debrief,
          message: text,
          history,
          bn_state: bnState ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
    } catch {
      setError('Could not reach the assistant — is the API server running?');
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [
    'What does this evidence tell us about the risk?',
    'Explain hard vs soft vs virtual evidence',
    'What additional evidence would improve the decision?',
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #dfe1e2',
        borderRadius: 8,
        background: '#fff',
        height: 520,
      }}
    >
      <div
        style={{
          padding: '0.6rem 1rem',
          borderBottom: '1px solid #dfe1e2',
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        Assistant
        <span style={{ fontWeight: 400, color: '#71767a', marginLeft: 8 }}>
          {debrief ? 'debrief mode' : `round ${round} context`}
        </span>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>
        {messages.length === 0 && (
          <div style={{ color: '#71767a', fontSize: 14 }}>
            <p style={{ marginTop: 0 }}>
              Ask about the evidence cards, the Bayesian Network, uncertainty, or what the
              current signals mean for DOC decisions.
            </p>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                style={{
                  display: 'block',
                  margin: '0.35rem 0',
                  padding: '0.35rem 0.6rem',
                  border: '1px solid #dfe1e2',
                  borderRadius: 16,
                  background: '#f9f9f9',
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              margin: '0.5rem 0',
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: '0.5rem 0.75rem',
                borderRadius: 10,
                fontSize: 14,
                whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? '#005ea2' : '#f0f0f0',
                color: m.role === 'user' ? '#fff' : '#1b1b1b',
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div style={{ color: '#71767a', fontSize: 13 }}>Thinking…</div>}
        {error && <div style={{ color: '#b50909', fontSize: 13 }}>{error}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0.6rem', borderTop: '1px solid #dfe1e2' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder='Ask the assistant…'
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            padding: '0.5rem',
            border: '1px solid #dfe1e2',
            borderRadius: 6,
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          style={{
            padding: '0 1rem',
            border: 'none',
            borderRadius: 6,
            background: busy || !input.trim() ? '#c9c9c9' : '#005ea2',
            color: '#fff',
            cursor: busy || !input.trim() ? 'default' : 'pointer',
            fontSize: 14,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
