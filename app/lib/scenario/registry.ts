import type { Scenario } from 'app/types/scenario';

// Drought — Phase 1 (all 11 events; RM rounds → RK debrief, no hazard layer).
import burundiDrought2021 from 'app/content/scenarios/burundi_drought_2021.json';
import djiboutiDrought2022 from 'app/content/scenarios/djibouti_drought_2022.json';
import eritreaHighlandsDrought2021 from 'app/content/scenarios/eritrea_highlands_drought_2021.json';
import ethiopiaBlueNileDrought2021 from 'app/content/scenarios/ethiopia_blue_nile_drought_2021.json';
import kenyaAsalDrought2020 from 'app/content/scenarios/kenya_asal_drought_2020.json';
import rwandaAkageraDrought2016 from 'app/content/scenarios/rwanda_akagera_drought_2016.json';
import somaliaSouthcentralDrought2020 from 'app/content/scenarios/somalia_southcentral_drought_2020.json';
import southSudanUpperNileDrought2021 from 'app/content/scenarios/south_sudan_upper_nile_drought_2021.json';
import sudanEasternDrought2022 from 'app/content/scenarios/sudan_eastern_drought_2022.json';
import tanzaniaKageraDrought2021 from 'app/content/scenarios/tanzania_kagera_drought_2021.json';
import ugandaKaramojaDrought2022 from 'app/content/scenarios/uganda_karamoja_drought_2022.json';

// Flood — Phase 2 (all 11 GHACOF events with daily BN windows + the Nairobi 2026
// case). Sudan Khartoum 2019 uses the shared Aug-2019 window (sdn_2019_08).
import ugandaFlood2019 from 'app/content/scenarios/uganda_flood_2019.json';
import eritreaHighlandsFlood2019 from 'app/content/scenarios/eritrea_highlands_flood_2019.json';
import southSudanUpperNileFlood2019 from 'app/content/scenarios/south_sudan_upper_nile_flood_2019.json';
import djiboutiFlood2019 from 'app/content/scenarios/djibouti_flood_2019.json';
import ethiopiaAddisFlood2021 from 'app/content/scenarios/ethiopia_addis_flood_2021.json';
import rwandaFlood2023 from 'app/content/scenarios/rwanda_flood_2023.json';
import somaliaFlood2023 from 'app/content/scenarios/somalia_flood_2023.json';
import burundiFlood2024 from 'app/content/scenarios/burundi_flood_2024.json';
import kenyaNairobiFlood2024 from 'app/content/scenarios/kenya_nairobi_flood_2024.json';
import tanzaniaFlood2024 from 'app/content/scenarios/tanzania_flood_2024.json';
import sudanKhartoumFlood2019 from 'app/content/scenarios/sudan_khartoum_flood_2019.json';
import nairobiFlood2026 from 'app/content/scenarios/nairobi_flood_2026.json';

/**
 * Static registry. Scenario JSON files are bundled (not fetched) — they are the
 * scenario scripts. Add a new event by dropping a JSON under
 * app/content/scenarios/ and importing it here.
 *
 * JSON imports widen string literals (e.g. hazard: string vs the DisasterType
 * union), so cast through `unknown`. The JSON shape is validated by review, not tsc.
 */
const SCENARIOS: Scenario[] = [
  // Drought (Phase 1)
  burundiDrought2021,
  djiboutiDrought2022,
  eritreaHighlandsDrought2021,
  ethiopiaBlueNileDrought2021,
  kenyaAsalDrought2020,
  rwandaAkageraDrought2016,
  somaliaSouthcentralDrought2020,
  southSudanUpperNileDrought2021,
  sudanEasternDrought2022,
  tanzaniaKageraDrought2021,
  ugandaKaramojaDrought2022,
  // Flood (Phase 2)
  ugandaFlood2019,
  eritreaHighlandsFlood2019,
  southSudanUpperNileFlood2019,
  djiboutiFlood2019,
  ethiopiaAddisFlood2021,
  rwandaFlood2023,
  somaliaFlood2023,
  burundiFlood2024,
  kenyaNairobiFlood2024,
  tanzaniaFlood2024,
  sudanKhartoumFlood2019,
  nairobiFlood2026,
].map((s) => s as unknown as Scenario);

export function listScenarios(): Scenario[] {
  return SCENARIOS;
}

export function getScenario(eventId: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.event_id === eventId);
}
