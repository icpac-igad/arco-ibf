import React from 'react';
import { listScenarios } from 'app/lib/scenario/registry';
import { ScenarioBrowser, type ScenarioCard } from './ScenarioBrowser';

/**
 * Scenario Mode index — a hazard filter (flood default) over the available event
 * simulations. Reached from the Risk Decisions stage launcher, or directly at /scenario.
 */
export default function ScenarioIndexPage() {
  const items: ScenarioCard[] = listScenarios().map((s) => ({
    event_id: s.event_id,
    title: s.title,
    hazard: s.hazard,
    country: s.country,
    admin1: s.admin1,
    forecastability: s.forecastability,
    offset_label: s.simulation_start.offset_label,
  }));

  return <ScenarioBrowser scenarios={items} />;
}
