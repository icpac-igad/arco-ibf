'use client';

import React, { useEffect, useState } from 'react';
import { MDXRemote, type MDXRemoteSerializeResult } from 'next-mdx-remote';
import { usePipelineStore } from 'app/store/providers/pipeline';
import {
  CountryHeader,
  ImpactStats,
  Hero,
  StatGrid,
  Stat,
  Block,
  Prose,
  BNDag,
} from 'app/components/mdx/event-components';

const mdxComponents = {
  CountryHeader,
  ImpactStats,
  Hero,
  StatGrid,
  Stat,
  Block,
  Prose,
  BNDag,
};

interface EventMdxResult {
  meta: {
    id: string;
    name: string;
    country: string;
    severity: string;
    period: string;
  };
  mdxSource: MDXRemoteSerializeResult;
}

export function MarkdownPanel() {
  const { selectedMonth, hazard, stage } = usePipelineStore();
  const [eventData, setEventData] = useState<EventMdxResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedMonth) {
      setEventData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Use the month/date key directly as the period param
    const period = selectedMonth;
    fetch(`/api/event-mdx?hazard=${hazard}&stage=${stage}&period=${encodeURIComponent(period)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Not found: ${res.status}`);
        return res.json();
      })
      .then((data: EventMdxResult) => {
        if (!cancelled) setEventData(data);
      })
      .catch((err) => {
        console.warn('MDX load failed, will show fallback', err);
        if (!cancelled) {
          setEventData(null);
          setError(err.message);
        }
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [selectedMonth, hazard, stage]);

  return (
    <div className='card markdown-card'>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>Event Detail</p>
          <h3>
            {eventData
              ? `${eventData.meta.name}`
              : selectedMonth
                ? `${selectedMonth} — ${hazard}`
                : 'Select a calendar cell'}
          </h3>
        </div>
        {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
      </div>

      {eventData ? (
        <article className='markdown-body mdx-event'>
          <MDXRemote {...eventData.mdxSource} components={mdxComponents} />
        </article>
      ) : error ? (
        <p className='text-base' style={{ color: '#9ca3af' }}>
          No MDX storyline available for this event. ({error})
        </p>
      ) : (
        <p className='text-base'>Choose a calendar cell to view event details.</p>
      )}
    </div>
  );
}
