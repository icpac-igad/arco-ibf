import React, { Suspense } from 'react';
import { DashboardShell } from './components/dashboard/DashboardShell';

export default function HazardDashboardPage() {
  return (
    <Suspense fallback={<div className="grid-container"><p>Loading...</p></div>}>
      <DashboardShell />
    </Suspense>
  );
}
