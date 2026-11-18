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
      <nav className='scn-crumbs' aria-label='Breadcrumb'>
        <ol>
          <li>
            <Link href='/scenario'>Scenarios</Link>
          </li>
          <li aria-current='page'>{scenario.title}</li>
        </ol>
      </nav>
      <ScenarioRunner scenario={scenario} />
    </>
  );
}
