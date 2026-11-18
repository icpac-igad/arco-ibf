import React, { Suspense } from 'react';
import { DashboardShell } from './components/dashboard/DashboardShell';
import { listScenarioCards } from 'app/lib/scenario/cards';

export default function HazardDashboardPage() {
  return (
    <Suspense fallback={<div className="grid-container"><p>Loading...</p></div>}>
      <DashboardShell scenarios={listScenarioCards()} />
    </Suspense>
  );
}
