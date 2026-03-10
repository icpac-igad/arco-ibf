'use client';

import React, { useEffect, useMemo, useState } from 'react';
import MarkdownIt from 'markdown-it';
import { fetchEmdatEventMarkdown } from 'app/lib/api/emdat';
import { usePipelineStore } from 'app/store/providers/pipeline';

const md = new MarkdownIt({ linkify: true, html: false });

export function MarkdownPanel() {
  const { selectedEventKey, selectedMonth, stage, hazard } = usePipelineStore();
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedEventKey) {
      setMarkdown('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEmdatEventMarkdown(selectedEventKey)
      .then((payload) => {
        if (!cancelled) {
          setMarkdown(payload?.markdown ?? '');
        }
      })
      .catch((error) => console.error('Failed to fetch markdown', error))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedEventKey]);

  const html = useMemo(() => md.render(markdown || ''), [markdown]);

  return (
    <div className='card markdown-card'>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>Storyline ({stage})</p>
          <h3>
            {selectedMonth ? `${selectedMonth} — ${hazard} context` : 'Select a calendar cell'}
          </h3>
        </div>
        {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
      </div>
      {markdown ? (
        <article
          className='markdown-body'
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className='text-base'>Choose an event to load its contextual storyline.</p>
      )}
    </div>
  );
}
