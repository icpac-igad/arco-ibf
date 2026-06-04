import React from 'react';

/**
 * Focused layout for Scenario Mode — deliberately omits the dashboard chrome
 * (hazard/stage chips, full calendar). The simulation drives its own surface.
 */
export default function ScenarioLayout({ children }: { children: React.ReactNode }) {
  return <main className='scenario-root grid-container'>{children}</main>;
}
