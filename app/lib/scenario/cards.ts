import { listScenarios } from 'app/lib/scenario/registry';
import type { ScenarioCard } from 'app/scenario/ScenarioBrowser';

/** Scenario tiles for the browser and the Risk Knowledge scenario entry (server-side:
 *  the scenario scripts stay out of the dashboard's client bundle). */
export function listScenarioCards(): ScenarioCard[] {
  return listScenarios().map((s) => {
    // Event window = first → last round cursor (flood YYYY-MM-DD, drought YYYY-MM).
    const cursors = s.rounds.map((r) => r.cursor_date).sort();
    return {
      event_id: s.event_id,
      title: s.title,
      hazard: s.hazard,
      country: s.country,
      admin1: s.admin1,
      forecastability: s.forecastability,
      offset_label: s.simulation_start.offset_label,
      period_start: cursors[0] ?? s.simulation_start.cursor_date,
      period_end: cursors[cursors.length - 1] ?? s.simulation_start.cursor_date,
      rounds: s.rounds.length,
      emdat_event_key: s.emdat_event_key,
      iso: s.gid_1?.split('.')[0],
    };
  });
}
