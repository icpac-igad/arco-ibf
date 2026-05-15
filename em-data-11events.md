# EM-DAT ↔ MDX cross-reference for the IBF case-study events

Matches each IBF case-study event (flood + drought) to its EM-DAT `Dis No`
and the Risk Knowledge MDX file the frontend serves.

- **MDX path on disk**: `arco-ibf/app/content/events/rk/{filename}`
- **MDX path in GCS**: `gs://crma-mdx-store/rk/{filename}`
- **Deep link**: `https://crma-frontend-yiyrp6yumq-uc.a.run.app/?hazard={drought|flood}&stage=risk-knowledge&month=YYYY-MM&event={Dis No}`

## Section 1 — Flood events

| # | IBF folder | Country | Event | Period | EM-DAT Dis No | MDX file | EM-DAT period | Notes |
|--:|---|---|---|---|---|---|---|---|
| 1 | `bdi/burundi_2024` | Burundi | Burundi 2024 | 2024-04-01 → 2024-04-22 | `2024-0232-BDI` | `fl-rk-2024-0232-BDI.mdx` | 04/2024 — 05/2024 | only Burundi 2024 flood in EM-DAT |
| 2 | `dji/djibouti_city_2019` | Djibouti | Djibouti City 2019 | 2019-11-21 → 2019-11-23 | `2019-0579-DJI` | `fl-rk-2019-0579-DJI.mdx` | 11/2019 — 11/2019 | exact month match |
| 3 | `eri/highlands_2019` | Eritrea | Eritrea Highlands 2019 | 2019-08-10 → 2019-08-15 | `2019-IBF03-ERI` (stub — not EM-DAT) | `fl-rk-2019-IBF03-ERI.mdx` | — | EM-DAT has **no** Eritrea flood event for 2019. Stub MDX created so the deep link resolves; narrative content must come from non-EM-DAT sources |
| 4 | `eth/addis_akaki_river_2021` | Ethiopia | Addis/Akaki River 2021 | 2021-08-16 → 2021-08-18 | `2021-0343-ETH` | `fl-rk-2021-0343-ETH.mdx` | 05/2021 — 05/2021 | **period mismatch** — only Ethiopia 2021 flood entry in EM-DAT is the May riverine flood, not the August Addis/Akaki event |
| 5 | `ken/kenya_nairobi_2024` | Kenya | Nairobi 2024 | 2024-04-24 → 2024-04-25 | `2024-0247-KEN` | `fl-rk-2024-0247-KEN.mdx` | 04/2024 — 04/2024 | Location field is exactly **"Nairobi"** — sharpest match among 4 candidates (`2024-0150`, `2024-0210`, `2024-0247`, `2024-0892`) |
| 6 | `rwa/rwanda_2023` | Rwanda | Rwanda 2023 | 2023-05-01 → 2023-05-06 | `2023-0267-RWA` | `fl-rk-2023-0267-RWA.mdx` | 05/2023 — 05/2023 | only Rwanda 2023 flood in EM-DAT |
| 7 | `sdn/khartoum_2019` | Sudan | Khartoum 2019 | 2019-08-01 → 2019-09-10 | `2019-0392-SDN` | `fl-rk-2019-0392-SDN.mdx` | 07/2019 — 09/2019 | Location includes **"Khartoum"** (alt candidate `2019-0280-SDN` is Darfur, Jun 2019) |
| 8 | `som/somalia_south_2023` | Somalia | Somalia South 2023 | 2023-11-19 → 2023-11-21 | `2023-0741-SOM` | `fl-rk-2023-0741-SOM.mdx` | 09/2023 — 11/2023 | covers Nov 2023; Locations are southern Somalia (Bay, Bakool, Jubaland, Hirshabelle …) |
| 9 | `ssd/south_sudan_upper_nile_2019` | South Sudan | Upper Nile 2019 | 2019-10-15 → 2019-12-15 | `2019-0486-SSD` | `fl-rk-2019-0486-SSD.mdx` | 10/2019 — 10/2019 | Location: **"Maban County (Upper Nile state)"** — exact match |
| 10 | `tza/dar_es_salaam_2024` | Tanzania | Dar es Salaam 2024 | 2024-04-10 → 2024-04-17 | `2024-0203-TZA` | `fl-rk-2024-0203-TZA.mdx` | 04/2024 — 05/2024 | only Apr 2024 Tanzania flood; Locations are Pwani/Coast regions (DSM not separately listed in EM-DAT) |
| 11 | `uga/uganda_2019` | Uganda | Uganda 2019 | 2019-05-26 → 2019-05-28 | `2019-0254-UGA` | `fl-rk-2019-0254-UGA.mdx` | 05/2019 — 05/2019 | Location: "Kikajjo, Lubowaa, Lufuka (Kampala)" — flash flood; sharpest May match among 5 candidates |

### Flood event mismatches that need attention

- **#3 Eritrea Highlands 2019**: EM-DAT has zero flood records for Eritrea in 2019. Either the event wasn't reported to EM-DAT (a real limitation — Eritrea has sparse EM-DAT coverage) or it was filed under another country. No MDX file can be generated until/unless the underlying parquet (`emdat_flood_adm1.parquet`) gains an ERI 2019 row.
- **#4 Addis/Akaki River 2021**: The single Ethiopia 2021 EM-DAT flood entry (`2021-0343-ETH`) is dated May, not August. The MDX file matches the country/year but not the IBF event period. If the August event was tracked separately, it isn't in EM-DAT — same upstream-data limitation as Eritrea.

### All flood MDX candidates per (year, country)

For reference, here's the full set of candidate matches I considered before
choosing the best one above (period frontmatter from each MDX shown).

| Year | Country | Dis No | Period (frontmatter) | Location head | Chosen? |
|---|---|---|---|---|:--:|
| 2024 | BDI | 2024-0232-BDI | 04/2024 — 05/2024 | — | ✓ |
| 2019 | DJI | 2019-0579-DJI | 11/2019 | — | ✓ |
| 2019 | ERI | — | — | — | (none) |
| 2021 | ETH | 2021-0343-ETH | 05/2021 | (no Location field) | ✓ (period mismatch) |
| 2024 | KEN | 2024-0150-KEN | 03/2024 — 05/2024 | Marsabit, Turkana, …, Nairobi, … | |
| 2024 | KEN | 2024-0210-KEN | 04/2024 | Nairobi, Marsabit, Turkana, … | |
| 2024 | KEN | 2024-0247-KEN | 04/2024 | **Nairobi** (only) | ✓ |
| 2024 | KEN | 2024-0892-KEN | 12/2024 | — | |
| 2023 | RWA | 2023-0267-RWA | 05/2023 | — | ✓ |
| 2019 | SDN | 2019-0280-SDN | 06/2019 | North and South Darfur | |
| 2019 | SDN | 2019-0392-SDN | 07/2019 — 09/2019 | White Nile, Kassala, **Khartoum**, Gazeera, N. Kordofan | ✓ |
| 2023 | SOM | 2023-0172-SOM | 03/2023 | — | |
| 2023 | SOM | 2023-0295-SOM | 04/2023 — 05/2023 | — | |
| 2023 | SOM | 2023-0683-SOM | 10/2023 | Baidoa, Jowhar, Luuq | |
| 2023 | SOM | 2023-0741-SOM | 09/2023 — 11/2023 | Bay, Ged, Bakool, South West, … | ✓ |
| 2019 | SSD | 2019-0285-SSD | 06/2019 | Lafon, Torit, Kapoeta South … | |
| 2019 | SSD | 2019-0486-SSD | 10/2019 | **Maban County (Upper Nile state)** | ✓ |
| 2024 | TZA | 2024-0203-TZA | 04/2024 — 05/2024 | Arusha, Morogoro, Pwani, … | ✓ |
| 2024 | TZA | 2024-0879-TZA | 11/2024 | — | |
| 2019 | UGA | 2019-0179-UGA | 04/2019 | Kabugundo, Nabeyo, Itanwa (Buyende, Kamuli) | |
| 2019 | UGA | 2019-0254-UGA | 05/2019 | Kikajjo, Lubowaa, Lufuka (Kampala) | ✓ |
| 2019 | UGA | 2019-0540-UGA | 10/2019 — 11/2019 | — | |
| 2019 | UGA | 2019-0599-UGA | 11/2019 — 12/2019 | — | |
| 2019 | UGA | 2019-0625-UGA | 12/2019 | — | |

---

## Section 2 — Drought events

Most drought IBF cases span multi-year windows (2020–2023 typical); EM-DAT
records single multi-month or multi-year droughts per ISO3, so a single EM-DAT
`Dis No` may cover part of the IBF window.

| # | IBF folder | Country | Title | Period (IBF) | EM-DAT Dis No | MDX file | EM-DAT period | Location match | Notes |
|--:|---|---|---|---|---|---|---|---|---|
| 01 | `dr_bdi/dr_case1` | Burundi | Burundi | 2021-01 → 2022-12 | `2021-IBF01-BDI` (stub) | `dr-rk-2021-IBF01-BDI.mdx` | — | — | Latest Burundi drought in EM-DAT is `2010-9082-BDI`. Stub created — see Stub MDX section below |
| 02 | `dr_dji/dr_case2` | Djibouti | Djibouti | 2021-01 → 2023-12 | `2022-9370-DJI` | `dr-rk-2022-9370-DJI.mdx` | 06/2022 — 07/2022 | Ali Sabieh, Arta, Dikhil, Obock, Tadjoura — countrywide | only modern Djibouti drought; period within the IBF window |
| 03 | `dr_eri/dr_case3` | Eritrea — Central Highlands | 2021-01 → 2023-12 | `2021-IBF03-ERI` (stub) | `dr-rk-2021-IBF03-ERI.mdx` | — | — | Latest Eritrea drought in EM-DAT is `2008-9200-ERI`. Stub created — see Stub MDX section below |
| 04 | `dr_eth/dr_case4` | Ethiopia — Blue Nile Headwaters | 2020-01 → 2023-11 | `2021-9546-ETH` | `dr-rk-2021-9546-ETH.mdx` | 05/2021 — 02/2022 | **Tigray, Afar, Amhara** (Blue Nile headwaters ✓) | best match — Amhara/Tigray are the Blue Nile headwaters. Alt: `2022-9174-ETH` (Somali/Oromia, 2022–02/2023) covers the Horn drought, not Blue Nile |
| 05 | `dr_ken/dr_case5` | Kenya — Tana River / ASAL | 2020-01 → 2023-11 | `2020-9609-KEN` | `dr-rk-2020-9609-KEN.mdx` | 12/2020 — 12/2022 | Marsabit, Mandera, Garissa, Wajir, Kilifi, **Tana River**, Makueni, Lamu, Samburu, Kitui, Isiolo, Laikipia (ASAL ✓) | exact ASAL coverage incl. Tana River |
| 06 | `dr_rwa/dr_case6` | Rwanda — Akagera River Basin | 2016-01 → 2017-12 | `2016-IBF06-RWA` (stub) | `dr-rk-2016-IBF06-RWA.mdx` | — | — | Latest Rwanda drought in EM-DAT is `2003-9651-RWA`. Stub created — see Stub MDX section below and "Rwanda post-2020" note further down |
| 07 | `dr_som/` | Somalia — South-Central | 2020-01 → 2023-12 | `2020-9609-SOM` | `dr-rk-2020-9609-SOM.mdx` | 03/2021 — 12/2022 | Gedo, Mudug, Galmudug, Jubaland, Puntland, South West states (incl. South-Central ✓) | covers the 2020-23 Horn of Africa drought |
| 08 | `dr_ssd/` | South Sudan — Upper Nile | 2021-01 → 2023-12 | `2021-9639-SSD` | `dr-rk-2021-9639-SSD.mdx` | 2021 — 11/2022 | Aweil South/East (N. Bahr el Gazzal), Gogrial West, Tonj South (Warrap) | **location mismatch** — Dis No 9639's affected admin1s are NW/Warrap, not Upper Nile state. Only modern SSD drought in EM-DAT, period otherwise overlaps |
| 09 | `dr_sdn/` | Sudan — Eastern States | 2021-01 → 2023-12 | `2022-9788-SDN` | `dr-rk-2022-9788-SDN.mdx` | 2022 — 11/2022 | (no Location field in EM-DAT row) | only modern SDN drought; period overlaps, but EM-DAT row has no admin1 — can't confirm "Kassala/Gedaref/Sennar" eastern-states scope |
| 10 | `dr_tza/dr_case10` | Tanzania — Kagera River Basin | 2022-01 → 2023-12 | `2021-9848-TZA` | `dr-rk-2021-9848-TZA.mdx` | 11/2021 — 12/2022 | Handeni, Longido, Mkinga, Monduli (NE Tanzania) | **location mismatch** — Dis No 9848 affects NE Tanzania (Tanga/Arusha), not the **Kagera** basin in NW. Only modern TZA drought |
| 11 | `dr_uga/dr_case11` | Uganda — Karamoja Subregion | 2021-01 → 2022-12 | `2022-9436-UGA` | `dr-rk-2022-9436-UGA.mdx` | 07/2022 — 12/2022 | **Napak, Kaabong, Kotido, Moroto (Karamoja)** ✓ | exact Karamoja match |

### Drought event mismatches that need attention

Five of the eleven drought cases have data gaps in EM-DAT:

| # | Case | Gap |
|--:|---|---|
| 01 | Burundi 2021-22 | No EM-DAT drought for Burundi after 2010 |
| 03 | Eritrea Central Highlands 2021-23 | No EM-DAT drought for Eritrea after 2008 |
| 06 | Rwanda Akagera 2016-17 | No EM-DAT drought for Rwanda after 2003 (see below) |
| 08 | South Sudan Upper Nile 2021-23 | Only modern SSD drought (`2021-9639-SSD`) is for Northern Bahr el Gazzal / Warrap, not Upper Nile |
| 10 | Tanzania Kagera 2022-23 | Only modern TZA drought (`2021-9848-TZA`) is for NE Tanzania (Tanga / Arusha), not Kagera (NW) |

For #08 and #10 the MDX exists and the period overlaps, so the deep link still
resolves — but the admin1 list shown in the MDX won't include the IBF-relevant
basin. For #01, #03, #06 the deep links will 404 until upstream EM-DAT data
adds those events (or until the IBF team substitutes a non-EM-DAT narrative).

### Rwanda drought post-2020 — explicit search result

The user asked specifically whether any drought event has been reported for
Rwanda after 2020. Searched two ways against `arco-ibf/app/content/events/rk/`
(which is the deployed-to-GCS source of truth, regenerated from
`emdat_drought_adm1.parquet`):

```bash
ls dr-rk-202*-*-RWA.mdx          # primary-country files
grep -l "Rwanda" dr-rk-202*.mdx  # secondary-country mentions in any 2020+ drought MDX
```

Both return **empty**. The full list of Rwanda drought MDX files in the
generator output is:

| File | Period |
|---|---|
| `dr-rk-1996-9089-RWA.mdx` | 1996 |
| `dr-rk-1999-9388-RWA.mdx` | 1999 (regional Horn drought, RWA included) |
| `dr-rk-2003-9651-RWA.mdx` | 2003 |

**EM-DAT carries zero Rwanda drought entries from 2004 onward.** This matches
known gaps in EM-DAT's coverage of inland equatorial countries — droughts
there often don't trigger the EM-DAT inclusion criteria (10+ deaths,
100+ affected officially reported, declaration of emergency, request for
international assistance) at country level, even when seasonally observable.

If the IBF Rwanda case6 (2016-17 Akagera) or any post-2020 Rwanda drought
needs an MDX narrative, it has to come from another source (national met
service reports, NDMA bulletins, regional SPI/CDI products from CHG /
ICPAC) — not from `emdat_drought_adm1.parquet`.

---

## Stub MDX for IBF cases not in EM-DAT

Four IBF case-study events have no corresponding EM-DAT record (Burundi
drought, Eritrea flood, Eritrea drought, Rwanda drought — see the
"mismatches" subsections above). To prevent the deep links from returning
404 in the deployed FE, a stub MDX file has been written for each, using
the naming pattern:

```
{dr|fl}-rk-{YEAR}-IBF{NN}-{ISO3}.mdx
                  └────┬───┘
                       IBF case number from the user's case table
```

`IBF{NN}` is the case number (`01`, `03`, `06`) — non-overlapping with EM-DAT
`Dis No` 4-digit identifiers (`0000–9999`), and the `IBF` literal makes it
obvious in any grep / log that this is an IBF-only stub, not an EM-DAT row.

| Stub filename | IBF case | Deep link |
|---|---|---|
| `fl-rk-2019-IBF03-ERI.mdx` | Flood #3 — Eritrea Highlands 2019 | `?hazard=flood&stage=risk-knowledge&month=2019-08&event=2019-IBF03-ERI` |
| `dr-rk-2021-IBF01-BDI.mdx` | Drought #01 — Burundi 2021-22 | `?hazard=drought&stage=risk-knowledge&month=2021-01&event=2021-IBF01-BDI` |
| `dr-rk-2021-IBF03-ERI.mdx` | Drought #03 — Eritrea Central Highlands 2021-23 | `?hazard=drought&stage=risk-knowledge&month=2021-01&event=2021-IBF03-ERI` |
| `dr-rk-2016-IBF06-RWA.mdx` | Drought #06 — Rwanda Akagera 2016-17 | `?hazard=drought&stage=risk-knowledge&month=2016-01&event=2016-IBF06-RWA` |

All four are in `gs://crma-mdx-store/rk/` and follow the existing MDX
frontmatter conventions (`id`, `name`, `country`, `iso`, `hazard`,
`severity`, `period`, `year`, `month`) plus an additional `source:` field
to mark them as `"IBF case study — not in EM-DAT"`.

### Known limitation — won't appear in the EventListPanel

`arco-ibf/app/components/dashboard/EventListPanel.tsx` reads events from
`/api/emdat-monthly-risk` (which reads `emdat_flood_adm1.parquet` /
`emdat_drought_adm1.parquet`). Since the IBF stubs have no parquet row,
they will not appear in the per-month event list — they're reachable
**only by direct URL** (deep link). To surface them in the calendar / list,
you'd need to add synthetic rows to the parquet (out of scope for this
change).

---

## How the MDX is served at runtime

```
URL bar
  ?hazard={drought|flood}&stage=risk-knowledge&month=YYYY-MM&event={Dis No}
                       │
                       ▼
arco-ibf/app/components/dashboard/MarkdownPanel.tsx
  → /api/event-mdx?hazard={drought|flood}&stage=risk-knowledge&period={Dis No}
                       │
                       ▼
arco-ibf/app/lib/load-event-mdx.ts → buildMdxKey()
  → rk/{dr|fl}-rk-{Dis No}.mdx
                       │
                       ▼
crma-api Cloud Run /api/mdx/raw/rk/{filename}
                       │
                       ▼
gs://crma-mdx-store/rk/{filename}
```

Generated by `arco-ibf/generate_event_mdx.py` (commit `02de261`).
