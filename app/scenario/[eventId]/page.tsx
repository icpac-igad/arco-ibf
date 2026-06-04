import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getScenario } from 'app/lib/scenario/registry';
import { ScenarioRunner } from './ScenarioRunner';

export default function ScenarioEventPage({ params }: { params: { eventId: string } }) {
  const scenario = getScenario(params.eventId);
  if (!scenario) return notFound();

  return (
    <>
      <div className='grid-row margin-top-2'>
        <div className='tablet:grid-col-12'>
          <Link href='/scenario' className='usa-link'>
            ← All scenarios
          </Link>
        </div>
      </div>
      <ScenarioRunner scenario={scenario} />
    </>
  );
}
