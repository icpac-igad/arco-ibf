import React from 'react';
import { listScenarioCards } from 'app/lib/scenario/cards';
import { ScenarioBrowser } from './ScenarioBrowser';

/**
 * Scenario Mode index — a hazard filter (flood default, or ?hazard=) over the
 * available event simulations. Reached from the Risk Knowledge stage's scenario entry, or
 * directly at /scenario.
 */
export default function ScenarioIndexPage({
  searchParams,
}: {
  searchParams?: { hazard?: string };
}) {
  const h = searchParams?.hazard;
  const initialFilter = h === 'drought' || h === 'flood' || h === 'all' ? h : 'flood';
  return <ScenarioBrowser scenarios={listScenarioCards()} initialFilter={initialFilter} />;
}
