import React from 'react';
import { TopBar } from 'app/components/shell/TopBar';

/**
 * Focused layout for Scenario Mode — deliberately omits the dashboard chrome
 * (hazard/stage chips, full calendar). The simulation drives its own surface.
 * The shared TopBar sits on a dark band so navigation matches the dashboard.
 * A <div>, not <main>: the root layout already renders <main id='pagebody'>.
 */
export default function ScenarioLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className='scn-topbar'>
        <TopBar />
      </div>
      <div className='scenario-root grid-container'>{children}</div>
    </>
  );
}
