import type { Scenario } from 'app/types/scenario';
import nairobiFlood2026 from 'app/content/scenarios/nairobi_flood_2026.json';
import kenyaAsalDrought2020 from 'app/content/scenarios/kenya_asal_drought_2020.json';
import ugandaKaramojaDrought2022 from 'app/content/scenarios/uganda_karamoja_drought_2022.json';

/**
 * Static registry of the MVP scenario set. Scenario JSON files are bundled
 * (not fetched) — they are the "game script". Add new events by dropping a JSON
 * under app/content/scenarios/ and importing it here.
 */
// JSON imports widen string literals (e.g. hazard: string vs the DisasterType
// union), so cast through `unknown`. The JSON shape is validated by review, not tsc.
const SCENARIOS: Scenario[] = [
  nairobiFlood2026 as unknown as Scenario,
  kenyaAsalDrought2020 as unknown as Scenario,
  ugandaKaramojaDrought2022 as unknown as Scenario,
];

export function listScenarios(): Scenario[] {
  return SCENARIOS;
}

export function getScenario(eventId: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.event_id === eventId);
}
