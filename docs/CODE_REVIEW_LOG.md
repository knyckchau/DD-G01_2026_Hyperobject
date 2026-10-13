# DD-G01 HYPEROBJECT · DD code review log

Hyperobject Media Museum, 260 12th Ave, Manhattan. M1-6, construction Type I-B, fully sprinklered, high-rise.
Course: SCI-Arc AS 3222, Spring 2027, DD phase. Record compiled 13 Oct 2026.

This file records the DD code review: what was checked, what the model and the web app show, which formulas were wrong and how they were fixed, the code text that was used, and what is still open. It is a working record for the team, not a code compliance report.

## Contents
1. Sources and naming
2. How to read the app (MEP, Life safety and Structure pages)
3. Compliance register (xlsx column F)
4. Formula review and fixes (MEP engine)
5. Life safety results (current model)
6. App changes and deployment
7. Open items
8. Code text library (verbatim, with sources)

---

## 1. Sources and naming

**Model files** (`models/`):
- `261004_base-program.fbx` (programme volumes, slabs, cores, shafts, basement technical rooms)
- `261004_core_restroom_mod.fbx` (detailed cores: walls, stairs, passenger and freight elevators, lobbies; restroom column)
- `260919_structure.fbx` (old structure model, WIP)

The prefix is the export date in YYMMDD form: `261004` = 4 Oct 2026. "vs 261004" in the register means "checked against the 4 Oct 2026 model".

**Code editions:** NYC Building Code 2022, Mechanical Code 2022 and Plumbing Code 2022 (NYC Admin. Code Title 28), NYC Zoning Resolution, NYC Fire Code, and NFPA 13 / 14 / 20 as referenced and modified by BC Appendix Q. Verbatim text was taken from American Legal Publishing (codelibrary.amlegal.com, current to Local Law 2026/147) and the nyc.gov 2022 chapter PDFs. NFPA body text is copyrighted and is cited, not quoted. Appendix Q NYC modifications are quoted.

**Floor names:**
- The web app names floors L01 (grade, +1.35 m) to L11 (+54.5 m), plus RT (roof technical level, +62.5 m) and B1 (basement, −3.45 m).
- Register column F (section 3) was written with **L00 = grade**, so its floor names are one lower than the app's. For example, register "L09" is app L10, and register "L10" is app L11.

**Project settings:**
- Highest occupied floor ≈ 174 ft above the lowest level, so the high-rise provisions apply. Above 120 ft, a fire service access elevator is required.
- Building height ≈ 229 ft, under the 420 ft limit for Type I-B sprinklered A/B/M (Table 504.3).
- Auditorium: 182 fixed seats (P3 drawing), so occupant load = seat count (§1004.3).

---

## 2. How to read the app

The web app has three pages: Structure, MEP and Life safety. Use the header switch to move between them. Assumptions are shared through the browser's local storage, so occupant loads match on the MEP and Life safety pages.

### MEP page (`web/index.html`)
- **Summary cards.** Click a card to grey out the others and open its code basis: section numbers, verbatim code text with a source link, and the formula with the current numbers. Press Esc or ✕ to close.
- **Summary › Checks pills** (for example `2 FAIL 13 WARN 11 OK 1 INFO`). These count the MEP coordination checks by status. The full list with reasons is in the **Checks** tab.

  | Pill | Meaning |
  |---|---|
  | FAIL | The calculated value breaks a code limit or a capacity (for example, risers do not fit the shaft, or the plant does not fit the room). |
  | WARN | The value is close to a limit, or the model lacks the information to decide; check manually. |
  | OK | Passes. |
  | INFO | Information only. |

- **Panels.** Drag the inner edge of either side panel to resize it; double-click to reset.

### Structure page (`web/st.html`)
- The structure model (`260919_structure.fbx`, old model, WIP) on its own page. It is no longer a layer tree on the MEP page.
- **Left panel.** View and floor filter; Layers with a Context group (slabs, floor labels, programme volumes with a 5–30% opacity slider) and one group per top-level FBX layer, plus a structure opacity slider.
- **Right panel.** Summary (groups, layers, triangles, height, source, alignment note), Layers (one row per layer; click to select) and Inspector (click a member in the model).

### Life safety page (`web/ls.html`)
**Left panel: layers**

| Group | Layers |
|---|---|
| Base | Slabs; floor labels with egress status; programme by occupancy group (A-1, A-2, A-3, B, M, other); occupant load tags; core walls |
| Vertical exits | Exit stair enclosures; stair flights (core model); stair ID tags; smokeproof vestibules; stairway to roof; basement exits |
| Horizontal egress | Egress paths (each zone to its nearest stair, with distance); worst exit access travel; second exit distance (Group A); exit separation against ⅓ of the diagonal |
| Elevators | Elevator cars; fire service access elevator candidates; elevator lobby |
| Fire protection | Standpipes with hose valves at each landing; roof manifold; fire command center placeholder |
| Hazards and separation | Multi-storey volumes (atrium); immersive halls (§411); mixed-occupancy floors (§508.4) |
| Context | Basement / site context; basement technical rooms |

**Right panel: tabs**

| Tab | Shows |
|---|---|
| Summary | Building-wide figures: total occupant load, and how many storeys or spaces meet each requirement (exits, stair capacity, separation, path of travel, common path), stair doors opening onto no floor, high-rise, FSE, stairway to roof, standpipes and hazards. Click a card for the code text and the calculation for every storey or space. |
| Floors | Every floor, plus a per-zone table for the selected floor. |
| Stairs | Each stair with its vestibule, the floors it serves, whether it reaches the roof, and its capacity. |
| Elevators | Cars, lobbies, vestibules and FSE candidates. |
| Checks | Building-wide items. |
| Inspector | Click a stair, car, lobby or programme volume to see its details. |

**Floor views.**
- Choose a floor to see the plan, fitted to the screen.
- The per-floor tags (distances, occupant loads, stair IDs) appear only in single-floor views.

**Automatic update.** Nothing is hard-coded per floor or core:
- Stairs come from `01_STAIRS` inside `CORES`.
- Cars and lobbies are clustered in the browser from `02_PASSENGER_ELEVATORS`, `03_FREIGHT_ELEVATOR` and `04_LOBBY_AREAS`.
- Floors and programme come from the base-programme FBX.

After a new export, run `python tools/build_data.py`, bump `APP_V` and push.

---

## 3. Compliance register (xlsx column F)

Delivered as `Applicable_Regulations_-_Updated_1013_checked.xlsx`. Column F, "Compliance check vs 261004 model (MEP web app, 2026-10-13)", was added and colour-coded. It was then reconciled after three independent reviews.

**Status counts across the rows:**

| Status | Rows |
|---|---|
| Not verifiable from the model | 84 |
| Partial | 17 |
| Does not comply | 10 |
| Applies | 6 |
| Complies | 6 |
| Not yet designed | 2 |
| Method correct (DD estimate) | 2 |
| Likely complies | 1 |
| Not required | 1 |
| Questionable applicability | 1 |
| Not pursued | 1 |
| Reference | 1 |

**Corrections made after the triple review:**
- §911 row.
- §504.3 height limit is 420 ft; "unlimited" applies to storeys under Table 504.4.
- OEE is permitted, not required (§403.6.2).
- §1011.2 minimum stair width is 44 in. The 48 in between handrails (§1009.3) is waived in sprinklered buildings.
- LL 5/1973 applicability is questionable.
- Floors carrying multi-storey volumes.

**Status since the register was written.** Column F describes the app as it was before the formula fixes in section 4. These register findings are now fixed in the app:
- §1004: NYC table number, immersive 30 net, shop at grade 30 gross, auditorium fixed seats.
- Plumbing: NYC Table 403.1 ratios, WSFU, 3 in/hr rainfall, 85 psi.
- §903: ordinary hazard spacing is now 11 ft.
- §905: 65 psi at the top outlet.

**Group A travel limit.** §1017 was written against a 250 ft Group A limit. NYC §1029.7 / Table 1029.7 sets **150 ft primary / 250 ft secondary** (sprinklered) for Group A, so the travel check was tightened (see section 5).

**Full column F** (regulation, clause, finding):

| Regulation | Clause | Compliance check vs 261004 model |
|---|---|---|
| **Federal** | | |
| Americans with Disabilities Act (ADA), Title III | 42 U.S.C. §12181 et seq. | Applies — Museum is a public accommodation. Compliance not verifiable from model. |
| 2010 ADA Standards for Accessible Design | 28 CFR Part 36 | Not verifiable from model — Accessible routes, stalls and fixture clearances not in model. |
| Section 504, Rehabilitation Act of 1973 | 29 U.S.C. §794 | Not verifiable from model — Funding status, outside model scope. |
| **New York State** | | |
| NYS Human Rights Law | Executive Law §296 | Not verifiable from model — Policy item. |
| **New York City** | | |
| NYC Zoning Resolution | ZR §11-11 District Designation | Applies — M1-6 per site data (not contained in model). |
|  | ZR §12-10 Definitions | Not verifiable from model — Reference only. |
|  | ZR §37-70 Public Plazas | Not verifiable from model — No public plaza modelled. |
|  | ZR §41-11 M1 Light Manufacturing Districts — Purpose | Applies — Verify use-group wording against ZR as amended by City of Yes (2024). |
|  | ZR §42-00 Use Regulations | Applies — Verify 'Use Group 3A' terminology against post-2024 ZR use tables. |
|  | ZR §42-10 Uses Permitted As-of-Right | Applies — As row 26. |
|  | ZR §42-20 Special Provisions Along District Boundaries | Not verifiable from model — Lot lines / adjacent districts not in model. |
|  | ZR §42-40 Performance Standards | Not verifiable from model — MEP noise/vibration data not available. |
|  | ZR §43-01 General Bulk Provisions | Not verifiable from model — Reference only. |
|  | ZR §43-12 Maximum Floor Area Ratio | Complies — Modelled floor plates ≈ 21,200 m² (≈ 228,000 sf) on a 113,157 sf lot (site data) ≈ FAR 2.0, below any M1-6 community facility FAR. Register base FAR 6.5 to be re-verified. |
|  | ZR §43-14 Floor Area Bonus for Public Plazas and Arcades | Not pursued — No qualifying plaza in model. |
|  | ZR §43-30 Yard Regulations | Not verifiable from model — Lot lines not in model. |
|  | ZR §43-40 Height and Setback | Not verifiable — Roof ≈ 229 ft above L00 slab; zoning height is measured from base plane, and sky exposure plane needs lot lines. |
|  | ZR §43-43 Front Wall Height & Sky Exposure Plane | Not verifiable from model — Street wall geometry vs lot line not in model. |
|  | ZR §43-45 Tower Regulations | Not verifiable — Tower coverage applies to the portion above the setback; needs lot lines. |
|  | ZR §44-00 Off-Street Parking Regulations | Not verifiable from model — Parking not modelled in 261004 base programme. |
|  | ZR §44-50 Off-Street Loading Berths | Not verifiable from model — Loading berths not modelled. |
| NYC Building Code | BC §302 Occupancy Classification and Use Designation | Partial — Model adds Food court / events (A-2, L07 + L08) and Terrace (L04). Terrace is normally classed by use (A-3 / A-2), not A-5. |
|  | BC §303 Assembly Group A | Partial — A-1 auditorium on L03 (182 seats per P3 drawing; seats not in FBX). A-2 food court missing from register. |
|  | BC §304 Business Group B | Complies — Offices L01 665 m², L02 497 m². |
|  | BC §309 Mercantile Group M | Does not comply (register) — Museum shop 288 m² at L00 exists in model — change from 'only if provided' to Mandatory. |
|  | BC §311 Storage Group S | Not verifiable from model — No storage/archive or parking volumes in base-programme model. |
|  | BC §508 Mixed Use and Occupancy | Partial — Table 508.4 separations must now include A-2 (food court) and M (shop). |
|  | BC §403 High-Rise Buildings | Partial — Triggered: highest occupied floor L10 ≈ 174 ft. Engine flags high-rise; FCC and fire pump room not yet modelled. |
|  | BC §404 Atriums | Partial — Volumes spanning two levels: immersive halls L02, L04, L05; gallery L03 and L08; auditorium L03. L00 and L10 halls are single-storey. Atrium vs enclosure not yet resolved. |
|  | BC §406 Motor-Vehicle-Related Occupancies | Not verifiable from model — Parking not modelled. |
|  | BC §410 Stages and Platforms | Not verifiable from model — Auditorium volume present (L03, 335 m², 9 m high); stage/proscenium not modelled. |
|  | BC §411 Special Amusement Areas | Partial — Register treats immersive halls as §411 (applicability is a judgement on whether egress is readily apparent). Alarm zones, exit signage and voice evacuation not modelled. |
|  | BC §415 Group H | Not verifiable from model — Generator fuel / battery quantities not defined. |
|  | BC §502 Definitions | Not verifiable from model — Reference only. |
|  | BC §503 General Height and Area Limitations | Applies — Type I-B selected; ratings not modelled. |
|  | BC §504 Building Height | Complies — NYC Table 504.3: Type I-B sprinklered A/B/M ≤ 420 ft; building ≈ 229 ft. Register text 'unlimited' is wrong for height (unlimited applies to storeys, Table 504.4). |
|  | BC §506 Building Area | Complies — Unlimited for I-B + A sprinklered. |
|  | BC §508 Mixed Use and Occupancy | Partial — See §508 above. |
|  | BC §509 Incidental Uses | Not verifiable from model — Five basement technical rooms modelled (≈298 m²); separations not modelled. |
|  | BC §602 Construction Classification | Not verifiable from model — Structure FBX is geometry only, no fire ratings. |
|  | BC §603 Combustible Material in Type I and II | Not verifiable from model |
|  | BC §703 Fire-Resistance Ratings | Not verifiable from model — Ratings not represented in model. |
|  | BC §704 Fire-Resistance Rating of Structural Members | Not verifiable from model — Fireproofing not represented. |
|  | BC §705 Exterior Walls | Not verifiable from model — Lot lines not in model. |
|  | BC §707 Fire Barriers | Not verifiable from model — Fire barrier locations not modelled. |
|  | BC §708 Fire Partitions | Not verifiable from model |
|  | BC §709 Smoke Barriers | Not verifiable from model |
|  | BC §710 Smoke Partitions | Not verifiable from model |
|  | BC §711 Floor and Roof Assemblies | Not verifiable from model |
|  | BC §712 Vertical Openings | Partial — Two-level volumes on L02, L03, L04, L05, L08 must be treated as atrium (§404) or enclosed (§713). |
|  | BC §713 Shaft Enclosures | Partial — 2 shafts + 4 cores modelled; ratings not represented. |
|  | BC §714 Penetrations | Not verifiable from model |
|  | BC §715 Fire-Resistant Joint Systems | Not verifiable from model |
|  | BC §716 Opening Protectives | Not verifiable from model |
|  | BC §717 Ducts and Air Transfer Openings | Not verifiable from model — Dampers not modelled. |
|  | BC §718 Concealed Spaces | Not verifiable from model — Envelope cavity not in model. |
|  | BC §803 Wall and Ceiling Finishes | Not verifiable from model — Finishes not in model. |
|  | BC §804 Interior Floor Finish | Not verifiable from model |
|  | BC §806 Decorative Materials and Trim | Not verifiable from model — LED wall materials not specified. |
|  | BC §903 Automatic Sprinkler Systems | Partial — Ordinary hazard spacing 12 ft = 144 sf/head exceeds NFPA 13 maximum 130 sf. Light hazard 225 sf/head is valid only with hydraulic calculation (pipe schedule = 200 sf). |
|  | BC §905 Standpipe Systems | Partial — Flow 500 + 250/standpipe, max 1,000 gpm, and 6 in pipe correct. NYC Appendix Q §7.8.1 sets 65 psi at top outlet (engine uses 100 psi, oversizes pump). No standpipe or stair to roof or basement; roof manifold missing. |
|  | BC §907 Fire Alarm and Detection Systems | Partial — Fire alarm included in emergency loads only; devices not modelled. |
|  | BC §909 Smoke Control Systems | Not yet designed — Required for atrium (§404.5) and smokeproof stairs (§403.5.4); no fans or shafts modelled, only a generator allowance. |
|  | BC §911 Fire Command Center | Not yet designed — Required (high-rise) but not modelled. |
|  | BC §1004 Occupant Load | Does not comply — engine.js cites IBC 'Table 1004.5' (NYC is 1004.1.3). Immersive 15 net matches no row (30 net museum or 5 net standing). Shop at grade 60 gross → 30 gross. Auditorium 7 net only if seats are not fixed (P3 drawing shows 182). Register column C also wrong: gallery 15 → 30 net, standing 7 → 5 net. |
|  | BC §1005 Egress Sizing | Does not comply — NYC §1005.3.1: stairs 0.3 in/occupant, no sprinkler/voice-alarm reduction; §1005.3.2: other components 0.2 in. 1.2 m stair ≈ 157 persons; three = 471, two = 314. L07 ≈ 490 and L08 ≈ 544 exceed. L03 ≈ 610 at 7 net, ≈ 275 with 182 fixed seats. Handrails do not reduce width (§1005.7.2 → §1014.8). Register column C values 0.2 / 0.15 are IBC, not NYC. |
|  | BC §1006 Number of Exits | Does not comply — S1 stops at L08; L11 roof technical level and basement have no stair. NYC table is 1006.3.1 (register cites IBC 1006.2.1 / 1006.3.3). |
|  | BC §1007 Exit and Exit Access Doorway Configuration | Does not comply — L09: S2–S3 centre 61 ft, nearest edges 43.5 ft < ⅓ diagonal 66 ft. L10: centre passes (61 ft) but nearest edges 43.5 ft < 49 ft; depends on door positions. Floors with S1 comply. |
|  | BC §1008 Means of Egress Illumination | Not verifiable from model |
|  | BC §1009 Accessible Means of Egress | Not verifiable from model — Areas of refuge / OEE not modelled. |
|  | BC §1010 Doors, Gates, Turnstiles | Not verifiable from model — Doors not modelled. |
|  | BC §1011 Stairways | Partial — §1011.2 minimum 44 in; 47.2 in complies. §1009.3 48 in between handrails waived in sprinklered buildings, so register '≥ 48 in' is wrong. No stair reaches roof (§1011.12). |
|  | BC §1012 Ramps | Not verifiable from model |
|  | BC §1013 Exit Signs | Not verifiable from model |
|  | BC §1014 Handrails | Not verifiable from model |
|  | BC §1015 Guards | Not verifiable from model — Terrace L04 guards not modelled. |
|  | BC §1017 Exit Access Travel Distance | Likely complies — Straight-line distance from farthest slab point to nearest stair ≤ 152 ft on all floors; measure actual path on L05, L07, L09. |
|  | BC §1018 Aisles | Not verifiable from model — Seating layout not modelled. |
|  | BC §1019 Exit Access Stairways and Ramps | Not verifiable from model |
|  | BC §1020 Corridors | Not verifiable from model — Corridors not modelled. |
|  | BC §1023 Interior Exit Stairways | Partial — Stairs sit inside cores; smokeproof enclosure/pressurisation not modelled. |
|  | BC §1024 Exit Passageways | Not verifiable from model |
|  | BC §1027 Exit Discharge | Not verifiable from model — Ground floor exit discharge not modelled. |
|  | BC §1029 Assembly | Not verifiable from model — Auditorium exits not modelled. |
|  | BC §1101 General | Not verifiable from model |
|  | BC §1103 Scoping Requirements | Complies — All occupancies in scope. |
|  | BC §1104 Accessible Route | Not verifiable from model — Accessible route not modelled. |
|  | BC §1105 Accessible Entrances | Not verifiable from model — Entrances not modelled. |
|  | BC §1106 Parking and Passenger Loading | Not verifiable from model — Parking not modelled. |
|  | BC §1108 Special Occupancies | Not verifiable from model — Seating not modelled. |
|  | BC §1109 Other Features and Facilities | Does not comply — Under NYC PC Table 403.1 tiered ratios several floors are short of WCs (L00 ≈ 12 required vs 7). No drinking fountains modelled (≈ 9–11 required). L10 has no restroom; accessible stalls not identified. |
|  | BC §1110 Signage | Not verifiable from model |
|  | BC §1204 Interior Space Dimensions | Complies — Engine computes ≈ 2.7 m clear under services, > 7 ft 6 in. |
|  | BC §1205 Lighting | Not verifiable from model |
|  | BC §1206 Ventilation | Method correct (DD estimate) — Ventilation rate procedure per MC §403 / ASHRAE 62.1. |
|  | BC §1402 Weather Protection | Not verifiable from model — Envelope not in model. |
|  | BC §1403 Performance Requirements | Not verifiable from model |
|  | BC §1404 Materials | Not verifiable from model |
|  | BC §1509 Radio and Television Antennas and Rooftop Equipment | Does not comply — Roof plant packed into technical space; FDNY access path not reserved and no stair reaches roof. |
|  | BC §1603 Construction Documents | Not verifiable from model — Structural model is geometry only. |
|  | BC §1604 General Design Requirements | Not verifiable from model |
|  | BC §1605 Load Combinations | Not verifiable from model |
|  | BC §1607 Live Loads | Not verifiable from model — Live loads not represented. |
|  | BC §1609 Wind Loads | Not verifiable from model |
|  | BC §1613 Earthquake Loads | Not verifiable from model |
|  | BC §1615 Structural Integrity | Not verifiable from model |
|  | BC §2403 General | Not verifiable from model — Glazing not in model. |
|  | BC §2406 Safety Glazing | Not verifiable from model |
|  | BC §2407 Glass in Handrails and Guards | Not verifiable from model |
|  | BC §2409 Glass in Walkways and Elevator Hoistways | Not verifiable from model |
|  | BC §2410 Glass Floors and Stairs | Not verifiable from model |
|  | BC §2411 Sloped Glazing and Skylights | Not verifiable from model |
|  | BC §2701 General | Not verifiable from model |
|  | BC §2702 Emergency and Standby Power | Partial — Generator: one elevator only, smoke control assumed 4 × 15 hp, fire pump on running kW without motor-starting allowance. Standby required for FSE (§3007.8) and any OEE installed. |
|  | BC §3002 Hoistway Enclosures | Partial — Hoistways inside modelled cores; rating not represented. |
|  | BC §3003 Emergency Operations | Not verifiable from model |
|  | BC §3004 Hoistway Venting | Not verifiable from model |
|  | BC §3005 Machine Rooms | Not verifiable from model — Machine room not modelled. |
|  | BC §3007 Fire Service Access Elevator (FSE) | Does not comply — NYC §403.6.1 requires at least one FSE; none designated, no 1-hr lobby. |
|  | BC §3008 Occupant Evacuation Elevator (OEE) | Not required — NYC §403.6.2 permits OEE but does not require it. Register 'Required for high-rise' is wrong. |
|  | BC §3105 Awnings and Canopies | Not verifiable from model |
| NYC Fire Code (FC) | FC §503 Fire Apparatus Access Roads | Not verifiable from model — Site not in model. |
|  | FC §511 Rooftop Obstructions | Does not comply — No roof access stair; plant layout does not reserve 6 ft path. |
| NYC Mechanical Code (2022 edition) |  | Method correct (DD estimate) — VRP per zone; central-AHU option lacks system Ev. |
| NYC Plumbing Code (2022 edition) |  | Does not comply — Engine ratios ≠ NYC PC Table 403.1: A-1/A-3 WC 1/70 M, 1/35 F for first 210 then 1/125, 1/65; A-1/A-3 DF 1/500; B uses stepped NYC table; libraries take B counts; terrace excluded. Lavatory WSFU should be 2 total, not 3. Storm rate NYC §1106.1 = 3 in/hr (engine 2.87). Register column C ratios also not NYC. |
| NYC Electrical Code (2025 edition, effective 21 Dec 2025) |  | Not verifiable from model |
| NYC Energy Conservation Code (NYCECC) (2020 edition) |  | Not verifiable from model — Envelope performance not in model. |
| Local Laws | LL 5/1973 Office Building Fire Safety | Questionable applicability — LL 5/1973 targets office buildings (verify height threshold and scope); register '40 ft' unsupported. |
|  | LL 26/2004 Sprinklers & Photoluminescent Path Markings | Partial — Sprinklers throughout yes; photoluminescent markings not in model. |
|  | LL 141/2013 Carbon Monoxide Detection | Not verifiable from model — Parking not modelled. |
|  | LL 77/2023 Chapter 10 Egress Amendments | Reference — Register Chapter 10 rows still use IBC numbering/values; align to NYC 2022 text. |
|  | LL 32/2023 NYC Stretch Energy Code | Not verifiable from model |
|  |  | Legend: green = complies · amber = partial / to confirm · red = does not comply · grey = not verifiable from the 261004 FBX / web app |
|  | !!! |  |
|  |  |  |
|  |  |  |
|  |  |  |

---

## 4. Formula review and fixes (MEP engine)

**Method.** Three reviewers each checked `web/engine.js` against the code text. They worked independently: none saw the others' notes or the earlier answers. Their findings were merged into one list, and every item below is fixed in `engine.js`. Each formula is shown with live numbers in the Summary cards on the MEP page.

### 4.1 Occupant load

Basis: NYC BC §1004.1, Table 1004.1.3, §1004.3.

| Item | Before | After |
|---|---|---|
| Table reference | IBC "Table 1004.5" | NYC Table 1004.1.3 |
| Immersive halls | 15 net (matches no table row) | 30 net (exhibit gallery and museum). Standing event use would be 5 net. |
| Shop / library | 60 gross on every floor | 30 gross at grade (`olfGrade`), 60 gross on other floors |
| Auditorium | 7 net | 182 fixed seats (§1004.3); 7 net applies only with chairs |
| Terrace | — | Group A-3 by use, not A-5 |

### 4.2 Plumbing fixtures

Basis: NYC PC Table 403.1 and §403.1.1. Libraries take B counts (footnote n). Outdoor areas are included (footnote d).

| Group | Water closets | Lavatories | Drinking fountains |
|---|---|---|---|
| A-1 / A-3 | 1 per 70 male and 1 per 35 female for the first 210, then 1 per 125 male and 1 per 65 female | — | 1 per 500 |
| A-2 | 1 per 75 | 1 per 200 | 1 per 500 |
| B (stepped table) | 1–20: 1 · 21–45: 2 · 46–70: 3 · 71–100: 4 · 101–140: 5 · 141–190: 6 · then +1 per 50 | 1–25: 1 · 26–50: 2 · 51–75: 3 · 76–115: 4 · 116–160: 5 · then +1 per 60 | 1 per 100 |
| M | 1 per 500 | 1 per 750 | 1 per 1,000 |

### 4.3 Water supply

- **Fixture units.** WSFU total = WC × 10 + lav × 2 + service sink × 3 + DF × 0.25 + kitchen × 20, used for every total (the lavatory value was 3; it is now 2).
- **Hunter curve.** The flush-valve tail is extended to 1500 → 269, 2000 → 325, 2500 → 380 and 3000 → 433 gpm. Above 3000 it is extrapolated as 433 + (w − 3000) × 0.106.
- **Pressure.** Static pressure is limited to 85 psi (PC §604.8). Flushometer flow pressure is 25 psi (Table 604.3).

### 4.4 Drainage and storm

- **Fixture units.** DFU uses service sink = 2 ("Sink" in Table 709.1, which has no service-sink row).
- **Building drain.** Sized from Table 710.1(1) at 1/8 in/ft: 180 / 390 / 700 / 1600 / 2900 / 4600 DFU. The 10 in leader is 2,050 gpm.
- **Storm.** Rainfall is 3 in/hr (§1106.1). Leaders follow Table 1106.3: 2 in 30 gpm, 3 in 92, 4 in 192, 5 in 360, 6 in 563, 8 in 1,208.

### 4.5 Fire protection

- **Sprinklers.** Ordinary-hazard spacing is 11 ft, giving 121 ft² per head (NFPA 13 maximum 130 ft²). Light hazard stays at 225 ft², which is valid only with a hydraulic calculation.
- **Fire pump.**
  - The top outlet pressure is 65 psi (Appendix Q modification of NFPA 14 §7.8.1).
  - Elevation is measured from the base level to the roof plus 1 m.
  - Flow is 500 gpm plus 250 per additional standpipe, up to 1,000.

### 4.6 Egress capacity and code references

- **Stair capacity.**
  - 0.3 in per occupant (BC §1005.3.1). NYC has no sprinkler reduction.
  - Handrails do not reduce the required width (§1005.7.2 → §1014.8).
  - A 1.2 m (47.2 in) stair therefore carries ≈ 157 occupants per storey.
- **Code references.** IBC numbers were replaced with NYC ones:
  - Table 1004.5 → Table 1004.1.3
  - §1018.4 → §1020.4
  - Table 1006.3.3 → Table 1006.3.1

### 4.7 Withdrawn claims

- A "§1004.1.1 not-simultaneous" exception does not exist in NYC BC 2022. Posted occupant load falls under §1004.1.3.2.
- Earlier stair-capacity figures that used 0.2 in per occupant, or deducted handrails, are superseded by 4.6.

---

## 5. Life safety results (current model)

**How the checks work.**
- **Paths stay on the floor plate.** Egress paths are walking routes on a 0.2 m grid of each floor plate. Where there is no slab there is no floor, so a path cannot pass.
- **Walls and openings.** The walls of the core model (`00_WALLS`, restroom `WALL` and `PARTITION`) are cut at floor + 1.0 m and block the route. Paths go through the openings in those walls and turn at wall ends; they never cut through a wall.
- **Floors inside the cores.** Stair landings, vestibules and lobbies (from the core model) count as floor, so a path can reach a stair through its door.
- **Obstacles.** Elevator hoistways and MEP shafts are not walkable.
- **When a stair counts.** A stair counts as an exit on a floor only if a route on that floor reaches its door.
- **Not yet modelled.** Rooms in the programme model have no walls or doors yet, so routes cross them freely until those are modelled.
- **Where routes start.** Each route starts at the most remote point inside a programme space: the point in its footprint (on the floor plate) farthest from any exit by walking distance.
  - The **path of travel** runs from that point to the nearest reachable exit.
  - The **common path of egress travel** is the part of that route shared with the route to a second, different exit, up to the point where the two separate: the straightened route to the nearest exit is followed until it moves more than 0.5 m away from the route to the second exit. The split point lies on the route, so the common path and the rest of the path of travel form one line.
  - If only one exit is reachable, the whole route is common path.
- **Exit separation** is still measured in a straight line, as §1007.1.1 requires.
- Each storey is checked on its own. The grade floor discharges directly outside, so it is shown as info.

**Limits used (sprinklered).**

| Check | Limit | Basis |
|---|---|---|
| Group A travel | 150 ft primary, 250 ft secondary | Table 1029.7 |
| Group M travel | 200 ft | Table 1017.2 |
| Group B travel | 300 ft | Table 1017.2 |
| Travel within an atrium | 200 ft | §404.9.3 |
| Exit separation | ⅓ of the floor's maximum diagonal | §1007.1.1 Ex. 2 |
| Stair capacity | 47.2 in ÷ 0.3 in = 157 occupants per stair | §1005.3.1 |

| Floor | ft | Occ | Groups | Stairs reached (✕ = no opening onto the floor) | Exits req / prov | Stair cap (occ / cap) | ⅓ diag ft | Sep edge (ctr) ft | Worst travel / limit ft | Worst common path ft | Worst 2nd exit / limit ft | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L01 | 0 | 695 | A-3/M | S1 S3 ✕ S2 | 3 / 2 (info) | 695 / 315 (info) | 90 | 122 (146) (info) | 114 / 150 (info) | 66 / 75 (info) | 218 / 250 | **info** |
| L02 | 27 | 331 | A-3/B | S1 S2 S3 | 2 / 3 (ok) | 331 / 472 (ok) | 96 | 122 (146) (ok) | 73 / 150 (ok) | 13 / 100 (ok) | 141 / 250 | **ok** |
| L03 | 43 | 228 | A-3/B | S1 S2 S3 | 2 / 3 (ok) | 228 / 472 (ok) | 94 | 122 (146) (ok) | 78 / 150 (ok) | 12 / 100 (ok) | 143 / 250 | **ok** |
| L04 | 60 | 276 | A-3/A-1 | S1 S2 ✕ S3 | 2 / 2 (ok) | 276 / 315 (ok) | 92 | 105 (125) (ok) | 199 / 150 (fail) | 175 / 75 (fail) | 298 / 250 | **fail** |
| L05 | 76 | 314 | A-3 | S1 S2 S3 | 2 / 3 (ok) | 314 / 472 (ok) | 89 | 122 (146) (ok) | 75 / 150 (ok) | 2 / 75 (ok) | 152 / 250 | **ok** |
| L06 | 92 | 130 | A-3 | S1 ✕ S2 S3 | 2 / 1 (fail) | 130 / 157 (ok) | 92 | 0 (0) (fail) | 108 / 150 (ok) | 108 / 75 (fail) | – / 250 | **fail** |
| L07 | 109 | 123 | A-3 | S2 S3 ✕ S1 | 2 / 2 (ok) | 123 / 315 (ok) | 67 | 44 (61) (fail) | 49 / 150 (ok) | 2 / 75 (ok) | 93 / 250 | **fail** |
| L08 | 125 | 490 | A-3/A-2 | S1 S2 S3 | 2 / 3 (ok) | 490 / 472 (fail) | 88 | 122 (146) (ok) | 117 / 150 (ok) | 2 / 75 (ok) | 170 / 250 | **fail** |
| L09 | 142 | 544 | A-3/A-2 | S1 S2 S3 | 3 / 3 (ok) | 544 / 472 (fail) | 75 | 122 (146) (ok) | 100 / 150 (ok) | 2 / 75 (ok) | 147 / 250 | **fail** |
| L10 | 158 | 230 | A-3 | S2 S3 | 2 / 2 (ok) | 230 / 315 (ok) | 66 | 44 (61) (fail) | 195 / 150 (fail) | 195 / 75 (fail) | 277 / 250 | **fail** |
| L11 | 174 | 199 | A-3 | S3 ✕ S2 | 2 / 1 (fail) | 199 / 157 (fail) | 49 | 0 (0) (fail) | 122 / 150 (warn) | 122 / 75 (fail) | – / 250 | **fail** |
| RT | 201 | 35 | – | – | 2 / 0 (fail) | 35 / 0 (fail) | 54 | 0 (0) (fail) | – / 200 (fail) | – / 75 (fail) | – | **fail** |

**Per space** (route from the most remote point inside each programme space):

| Floor | Space | Group | Occ | Exit | Path of travel / limit ft | Common path / limit ft | 2nd exit / limit ft |
|---|---|---|---|---|---|---|---|
| L01 | immersive | A-3 | 144 | S1 | 98 / 150 (warn) | 3 / 75 (ok) | 218 / 250 |
| L01 | lobby | A-3 | 447 | S3 | 114 / 150 (warn) | 2 / 75 (ok) | 202 / 250 |
| L01 | shop | M | 104 | S3 | 82 / 200 (ok) | 66 / 75 (warn) | – |
| L02 | gallery | A-3 | 259 | S3 | 73 / 150 (ok) | 3 / 75 (ok) | 141 / 250 |
| L02 | office | B | 72 | S1 | 93 / 300 (ok) | 13 / 100 (ok) | – |
| L03 | immersive | A-3 | 174 | S3 | 78 / 150 (ok) | 3 / 75 (ok) | 143 / 250 |
| L03 | office | B | 54 | S1 | 87 / 300 (ok) | 12 / 100 (ok) | – |
| L04 | gallery | A-3 | 94 | S1 | 199 / 150 (fail) | 175 / 75 (fail) | 298 / 250 |
| L04 | auditorium | A-1 | 182 | S1 | 81 / 150 (ok) | 16 / 75 (ok) | 188 / 250 |
| L05 | immersive | A-3 | 137 | S3 | 67 / 150 (ok) | 2 / 75 (ok) | 121 / 250 |
| L05 | terrace | A-3 | 177 | S2 | 75 / 150 (ok) | 2 / 75 (ok) | 152 / 250 |
| L06 | immersive | A-3 | 130 | S1 | 108 / 150 (ok) | 108 / 75 (fail) one exit | – / 250 |
| L07 | gallery | A-3 | 123 | S3 | 49 / 150 (ok) | 2 / 75 (ok) | 93 / 250 |
| L08 | gallery | A-3 | 123 | S2 | 49 / 150 (ok) | 2 / 75 (ok) | 93 / 250 |
| L08 | food | A-2 | 367 | S1 | 117 / 150 (ok) | 2 / 75 (ok) | 170 / 250 |
| L09 | gallery | A-3 | 105 | S3 | 92 / 150 (ok) | 2 / 75 (ok) | 107 / 250 |
| L09 | food | A-2 | 306 | S1 | 100 / 150 (ok) | 2 / 75 (ok) | 147 / 250 |
| L09 | gallery | A-3 | 133 | S2 | 53 / 150 (ok) | 2 / 75 (ok) | 101 / 250 |
| L10 | immersive | A-3 | 104 | S2 | 195 / 150 (fail) | 195 / 75 (fail) | 277 / 250 |
| L10 | gallery | A-3 | 126 | S2 | 54 / 150 (ok) | 2 / 75 (ok) | 97 / 250 |
| L11 | immersive | A-3 | 199 | S3 | 122 / 150 (warn) | 122 / 75 (fail) one exit | – / 250 |
| RT | technical | - | 35 | – | – / 200 (fail) | – / 75 (fail) | – |

- **WARN · High-rise** — Highest occupied floor ≈ 174 ft above the lowest level (> 75 ft): high-rise provisions of §403 apply (fire command center, smokeproof enclosures, standby and emergency power, voice alarm, fire service access elevator above 120 ft). _(NYC BC §202, §403)_
- **FAIL · Stairway to roof** — No stair reaches the roof level (+62.5 m); highest stair top +56.6 m. One stairway must extend to the roof through a bulkhead; the standpipe roof manifold also depends on it. _(NYC BC §1011.12; App. Q (NFPA 14 §7.3.2.1))_
- **FAIL · Basement exits** — No modelled stair reaches the basement (-3.5 m), which has 5 technical rooms. Provide exit stairs or confirm the basement egress route (Table 1006.3.1). _(NYC BC §1006.3.1, Table 1006.3.1)_
- **INFO · Exit stairways** — 3 stairs in the model. Capacity 47.2 in ÷ 0.3 in/occ = 157 occupants per stair per storey. Enclosures 2-hour (four or more storeys). _(NYC BC §1005.3.1, §1007.1.1, §1023.2)_
- **WARN · Smokeproof enclosures** — Every stair serving floors above 75 ft has an attached vestibule in the model (S1→LB1, S2→LB3, S3→LB4). Ventilation or pressurisation per §909.20 still to be designed. _(NYC BC §403.5.4, §909.20, §1023.11)_
- **WARN · Fire service access elevator** — Occupied floor > 120 ft: at least one FSE serving every floor. Model: 4 cars (E1 freight, E2 passenger, E3 passenger, E4 passenger), top +56.9 m. Candidates with an enclosed lobby reaching the top occupied floor: E1, E2, E3, E4; lobby LB2 adjoins stair S2. Floors not reached: RT. Designate one and confirm lobby, standby power and water protection per §3007. _(NYC BC §403.6.1, §3007.1)_
- **INFO · Occupant evacuation elevators** — Permitted but not required (§403.6.2); if provided, §3008 applies. _(NYC BC §403.6.2, §3008)_
- **INFO · Fire command center** — Not in the model. Locate at grade in a position approved by FDNY, typically next to the main entrance and the FSE lobby; contents and size per §911. _(NYC BC §403.4.6, §911)_
- **WARN · Multi-storey volumes (atrium / vertical opening)** — Volumes spanning more than one storey: L03 (immersive) · L04 (gallery, auditorium) · L05 (immersive) · L06 (immersive) · L09 (gallery). Treat as atrium (smoke control, enclosure, ≤ 200 ft of travel within the atrium) or enclose as shafts. _(NYC BC §404, §404.9.3, §712)_
- **WARN · Immersive halls — special amusement** — 6 immersive halls (L01, L03, L05, L06, L10, L11). If the egress path is not readily apparent (darkened, LED-enclosed), §411 applies: Group A (75 or more occupants), automatic fire detection, exit marking, voice alarm. _(NYC BC §411.1)_
- **INFO · Auditorium** — 1 auditorium volume(s) on L04; occupant load = 182 fixed seats (§1004.3). Aisles, main exit and travel per §1029. _(NYC BC §1004.3, §1029)_
- **WARN · Mixed occupancy** — Groups in the model: A-1, A-2, A-3, B, M. With separated occupancies each pair needs fire barriers per Table 508.4 (sprinklered values). Floors with more than one group: L01 (A-3/M) · L02 (A-3/B) · L03 (A-3/B) · L04 (A-3/A-1) · L08 (A-3/A-2) · L09 (A-3/A-2). _(NYC BC §508.4, Table 508.4)_
- **FAIL · Stair not reachable from the floor** — L01: S2 · L04: S3 · L06: S2, S3 · L07: S1 · L11: S2. The stair passes the floor but no opening connects it to the floor plate (no slab at the door, or no door in the enclosure). _(NYC BC §1006.3.1, §1023)_
- **FAIL · Common path of egress travel** — L04: gallery 175 / 75 ft · L06: immersive 108 / 75 ft (one exit reachable) · L10: immersive 195 / 75 ft · L11: immersive 122 / 75 ft (one exit reachable) · RT: technical 0 / 75 ft. Measured from the most remote point of each space until the routes to two different exits separate. _(NYC BC §1006.2.1, Table 1006.2.1)_
- **FAIL · Floor egress checks** — Floors failing at least one check: L04, L06, L07, L08, L09, L10, L11, RT (see Floors). _(NYC BC §1005, §1006, §1007, §1017, §1029.7)_

**Stairs:** S1 +1.1→+46.6 m, vestibule LB1, roof no · S2 +1.1→+56.6 m, vestibule LB3, roof no · S3 +1.1→+56.6 m, vestibule LB4, roof no

**Elevators:** E1 freight +-0.5→+56.9 m, lobby LB2 (adjoins S2), FSE candidate · E2 passenger +-0.5→+56.9 m, lobby LB2 (adjoins S2), FSE candidate · E3 passenger +-0.5→+56.9 m, lobby LB2 (adjoins S2), FSE candidate · E4 passenger +-0.5→+56.9 m, lobby LB2 (adjoins S2), FSE candidate

**Reading the results** (walking routes on the floor plate):

- **Stairs with no opening onto the floor.**
  - L01: S2. L04: S3. L06: S2 and S3. L07: S1. L11: S2.
  - Each of these stairs passes the floor, but the floor plate does not reach its door: there is either no slab at the vestibule, or no opening in the enclosure.
  - As a result, L06 and L11 have only one exit, and fail §1006.3.1 and §1007.1.1.
  - Decide per case: extend the slab to the stair door, add a door, or confirm that the stair does not serve that floor.
- **Path of travel** (measured from the most remote point inside each space).
  - Over the Group A limit of 150 ft:
    - L04 gallery: 199 ft. S3's door opens onto no floor, so the route runs round the void to S1.
    - L10 immersive hall: 195 ft. The only way out is the corridor north of the core, to S2.
  - Over the 250 ft second-exit limit: L04 gallery, 298 ft; L10 immersive hall, 277 ft.
- **Common path of egress travel** (Table 1006.2.1, sprinklered: A 75 ft, B 100 ft).
  - L04 gallery: 175 ft.
  - L10 immersive hall: 195 ft. Its routes to S2 and S3 share the whole corridor.
  - L06 and L11: only one exit is reachable, so the whole route is common: 108 ft and 122 ft.
- **Stair capacity fails on L08 and L09.**
  - L08 has 490 occupants and L09 has 544, against 3 × 157 = 472.
  - L11, with only S3 reached, carries 199 occupants against 157.
- **Exit separation fails on L07 and L10.**
  - Only S2 and S3 serve these floors: 44 ft at the edges and 61 ft centre to centre, against 67 ft and 66 ft required.
- **No stair reaches the roof, and the basement has no exit stair.**
- **Fire service access elevator: one still has to be designated.**
  - All four cars share lobby LB2, which adjoins S2.

---

## 6. App changes and deployment

### Changes this round (APP_V `20261013d`)

**MEP page**
- Formula fixes (section 4).
- Summary cards show the code basis, verbatim text and live formula.
- Both side panels are resizable.
- Cache-busting version `APP_V` added.

**New Life safety page**
- New files: `web/ls.html`, `web/ls-app.js`, `web/lifesafety.js` and `web/ls-codes.js`.
- The header switch *MEP / Life safety* appears on both pages.
- The earlier Life safety tab inside the MEP page has been removed.

**New Structure page**
- New files: `web/st.html` and `web/st-app.js`.
- The structure tree, loader and opacity slider were removed from the MEP page (`web/app.js`, `web/index.html`).
- The header switch reads *Structure / MEP / Life safety* on all three pages.

**Shared styles**
- The MEP page CSS moved to `web/style.css`.

**`engine.js` defaults**
- The Life safety keys are `stairClearIn`, `stairFactor`, `sepFraction`, `travelA1`, `travelA2`, `travelB`, `travelM`, `travelAtrium`, `cpetA` and `cpetB`.

**Docs**
- `README.md` and `docs/METHODOLOGY.md` are updated.
- This log is new.

### Deploy (GitHub Desktop, fork `knyckchau/DD-G01_2026_Hyperobject`)

1. **Bump the version.** If anything changed after this round, raise `APP_V` and every `?v=` in `web/index.html`, `web/ls.html` and `web/st.html`. Also raise the import lines at the top of `web/app.js`, `web/ls-app.js` and `web/st-app.js`.
2. **Commit.** In GitHub Desktop, tick the changed files. Leave `AGENTS.md` unticked, because it is local only. Write a summary, click **Commit to main**, then **Push origin**.
3. **Wait for the build.** GitHub Pages rebuilds from `main` in about a minute. The browser cache lasts about 10 minutes, which the version bump bypasses.
4. **Open the pages.** MEP is at `https://knyckchau.github.io/DD-G01_2026_Hyperobject/web/`, Life safety at `…/web/ls.html` and Structure at `…/web/st.html`.
5. **Share upstream.** To bring the work into Mattia's repository (`Mattia137/DD-G01_2026_Hyperobject`), open a pull request from the fork.

**Local preview.** Run `python tools/serve.py`, then open `http://localhost:8765/web/ls.html`.

---

## 7. Open items

**Code readings to verify**
- PC Table 403.1, Group B stepped table: confirm the column assignment.
- BC Table 1006.2.1: the column reading (74 occupants; common path 75 ft for A and M, 100 ft for B) is inferred from extracted text.
- BC §1020.4 Exception 3: the quoted text is a fragment.
- Service-sink DFU: Table 709.1 has no service-sink row; "Sink" = 2 is used.

**Model inputs**
- Stair clear width: not in the model. The assumption is 47.2 in.
- Door positions are needed for:
  - exit separation (measured between doors);
  - common path (§1006.2.1);
  - dead ends (§1020.4);
  - auditorium exits (§1029).
- Stair to roof with a bulkhead (§1011.12). Roof access path for FDNY (FC §511).
- Basement exit stair or exit route.
- FSE designation, lobby and standby power (§403.6.1, §3007). Whether the cars should serve RT.
- Fire command center location, to be approved by FDNY (§403.4.6, §911).

**Design decisions**
- Multi-storey volumes: decide atrium (§404, smoke control) or enclosure (§712 / §713).
- Immersive halls: decide on §411 special amusement applicability.
- §508.4 separations: confirm for A-1 / A-2 / A-3 / B / M.

**Register and sources**
- LL 5/1973 applicability.
- NFPA 13 / 14 / 20 text: check against licensed copies; it is cited, not quoted.

---

## 8. Code text library

Verbatim text as shown in the app (MEP Summary cards and the Life safety Code tab). "…" marks a cut. Table rows are condensed and shown without quotation marks.

#### Occupant load

**BC §1004.1 Design occupant load** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-172941))

> “In determining means of egress requirements, the number of occupants for whom means of egress facilities shall be provided shall be established by the largest number computed in accordance with Section 1004.1.3, unless otherwise permitted by Section 1004.1.3.1, 1004.1.3.2 or 1004.2.”

**BC §1004.1.3** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-172973))

> “The number of occupants shall be computed at the rate of one occupant per unit of area as prescribed in Table 1004.1.3.”

**BC Table 1004.1.3 (rows used)** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-172973))

> Accessory storage areas, mechanical equipment room — 300 gross · Assembly: Exhibit gallery and museum — 30 net · Assembly with fixed seats — See Section 1004.3 · Assembly without fixed seats: Concentrated (chairs only – not fixed) — 7 net; Standing space / waiting area — 5 net; Unconcentrated (tables and chairs) — 15 net · Business areas, including accessory areas on terraces and rooftops — 100 gross · Mercantile: Areas on other floors — 60 gross; Basement and grade floor areas — 30 gross

**BC §1004.3 Fixed seating** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-172990))

> “For areas having fixed seats and aisles, the occupant load shall be determined by the number of fixed seats installed therein. The occupant load for areas in which fixed seating is not installed, such as waiting spaces, shall be determined in accordance with Section 1004.1.3 and added to the number of fixed seats.”

#### Ventilation (MC)

**MC §403.3.1.1 Outdoor airflow rate** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-193237))

> “Ventilation systems shall be designed to have the capacity to supply the minimum outdoor airflow rate determined in accordance with this section. […] The occupant load utilized for design of the ventilation system shall be not less than the number determined from the estimated maximum occupant load rate indicated in Table 403.3.1.1.”

**MC §403.3.1.1.1.1 Breathing zone outdoor airflow** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-193267))

> “The outdoor airflow rate required in the breathing zone Vbz of the occupiable space or spaces in a zone shall be determined in accordance with Equation 4-1. Vbz = RpPz + RaAz (Equation 4-1)”

**MC §403.3.1.1.1.3 Zone outdoor airflow** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-193283))

> “The zone outdoor airflow rate (Voz), shall be determined in accordance with Equation 4-2. Voz = Vbz / Ez (Equation 4-2)”

#### Plumbing fixtures (PC)

**PC §403.1 Minimum number of fixtures** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-161441))

> “Plumbing fixtures shall be provided for the type of occupancy and in the minimum number shown in Table 403.1. Types of occupancies not shown in Table 403.1 shall be considered individually by the commissioner. The number of occupants shall be determined by the New York City Building Code. Occupancy classification shall be determined in accordance with the New York City Building Code.”

**PC §403.1.1 Fixture calculations** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022PC_Chapter4_FixturesWBwm.pdf))

> “To determine the occupant load of each sex, the total occupant load shall be divided in half. To determine the required number of fixtures, the fixture ratio or ratios for each fixture type shall be applied to the occupant load of each sex in accordance with Table 403.1. Fractional numbers resulting from applying the fixture ratios of Table 403.1 shall be rounded up to the next whole number. For calculations involving multiple occupancies, such fractional numbers for each occupancy shall first be summed and then rounded up to the next whole number. Fixture calculations in Group B office occupancies shall utilize the total occupant load on a given floor to determine the number of fixtures required for that floor.”

#### Water pressure (PC)

**PC §604.8 Water pressure-reducing valve or regulator** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-162005))

> “Where water pressure within a building exceeds 85 psi (586 kPa) static, an approved valve conforming to ASSE 1003 or CSA B356 with strainer shall be installed to reduce the pressure in the building water distribution piping to not greater than 85 psi (586 kPa) static.”

**PC Table 604.3 (flushometer rows)** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-161971))

> Water closet, blow out, flushometer valve — flow rate 25 gpm, flow pressure 25 psi · Water closet, siphonic, flushometer valve — flow rate 25 gpm, flow pressure 25 psi

#### Drainage (PC)

**PC §709.1 Values for fixtures** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-162726))

> “Drainage fixture unit values as given in Table 709.1 designate the relative load weight of different kinds of fixtures that shall be employed in estimating the total load carried by a soil or waste pipe, and shall be used in connection with Tables 710.1(1) and 710.1(2) of sizes for soil, waste and vent pipes for which the permissible load is given in terms of fixture units.”

**PC Table 709.1 (rows used)** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-162726))

> Water closet, flushometer, tank, public or private — 4 · Lavatory — 1 · Drinking fountain — 1/2 · Floor drains — 2 · Sink — 2

**PC §710.1 Maximum fixture unit load** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-162751))

> “The maximum number of drainage fixture units connected to a given size of building sewer, building drain or horizontal branch of the building drain shall be determined using Table 710.1(1). The maximum number of drainage fixture units connected to a given size of horizontal branch or vertical soil or waste stack shall be determined using Table 710.1(2).”

#### Storm drainage (PC)

**PC §1106.1 General** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-163441))

> “The size of the vertical conductors and leaders, gutters, building storm drains, building storm sewers and any horizontal branches of such drains or sewers shall be based on the 100-year hourly rainfall rate of 3 inches (76 mm) per hour. Sizing for secondary and combined primary and secondary conductors, leaders and drains shall be in accordance with Section 1108.”

**PC §1106.3 Vertical leader sizing** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-163449))

> “Vertical leaders shall be sized based on the flow rate from horizontal gutters or the maximum flow rate through roof drains. The flow rate through vertical leaders shall not exceed that specified in Table 1106.3.”

**PC Table 1106.3 Vertical Leader Sizing** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-163449))

> Size of leader (inches) — capacity (gpm): 2 — 30 · 3 — 92 · 4 — 192 · 5 — 360 · 6 — 563 · 8 — 1208

#### Standby / emergency power

**BC §403.4.8 Standby and emergency power** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-166719))

> “A standby power system complying with Section 2702 and Section 3003 shall be provided for the standby power loads specified in Section 403.4.8.3. An emergency power system complying with Section 2702 shall be provided for the emergency power loads specified in Section 403.4.8.4.”

#### Sprinklers

**BC §903.3.1.1 NFPA 13 sprinkler systems** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-171385))

> “Where the provisions of this code require that a building or portion thereof be equipped throughout with an automatic sprinkler system in accordance with this section, sprinklers shall be installed throughout in accordance with NFPA 13 except as provided in Sections 903.3.1.1.1 and 903.2 of this code.”

#### Standpipes / fire pump

**BC §905.3.1 Applicability, item 4** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-171599))

> “In buildings of any area, constructed in accordance with Section 403, with occupied floors located 75 feet (22 860 mm) or more above the lowest level of Fire Department vehicle access.”

**BC Appendix Q, NFPA 14 §7.8.1 (NYC modification)** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_AppendixQ_FireStandardsWBwm.pdf))

> “Replace the words "100 psi (6.9 bar)" with "65 psi (4.5 bar)".”

**BC Appendix Q, NFPA 14 §7.3.2.1 (NYC modification, first sentence)** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_AppendixQ_FireStandardsWBwm.pdf))

> “Roof Manifold. At the top of the highest riser there shall be provided, above the main roof level, a three-way manifold equipped with three 2½ inch (63.5 mm) hose valves with hose valve caps.”

#### Number of exits

**BC §1006.3.1 Egress based on occupant load** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_Chapter10_EgressWBwm.pdf))

> “Each story or occupied roof designed for human occupancy or use shall have the minimum number of exits, or access to exits, as specified in Table 1006.3.1.”

**BC Table 1006.3.1 Minimum number of exits or access to exits per story** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_Chapter10_EgressWBwm.pdf))

> 1–500 occupants — 2 · 501–1,000 — 3 · More than 1,000 — 4

#### Stair capacity and enclosure

**BC §1005.3.1 Stairways** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_Chapter10_EgressWBwm.pdf))

> “The capacity, in inches, of means of egress stairways shall be calculated by multiplying the occupant load served by such stairways by a means of egress capacity factor of 0.3 inch (7.6 mm) per occupant. Where stairways serve more than one story, only the occupant load of each story considered individually shall be used in calculating the required capacity of the stairways serving that story.”

**BC §1023.2 Construction** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-174102))

> “Enclosures for interior exit stairways and ramps shall be constructed as fire barriers in accordance with Section 707 or horizontal assemblies constructed in accordance with Section 711, or both. Interior exit stairway and ramp enclosures shall have a fire-resistance rating of not less than 2 hours where connecting four stories or more and not less than 1 hour where connecting less than four stories. …”

#### Exit separation

**BC §1007.1.1 Two exits or exit access doorways** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-173125))

> “Where two exits, exit access doorways, exit access stairways or ramps, or any combination thereof, are required from any portion of the exit access, they shall be placed a distance apart equal to not less than one-half of the length of the maximum overall diagonal dimension of the building or area to be served measured in a straight line between them. Stairs sharing any common wall, floor, ceiling, scissor stair assembly, or other enclosure shall be counted as one exit stairway. …”

**BC §1007.1.1 Exception 2 (remote location in sprinklered buildings)** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-173125))

> “Where a building is equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1 or 903.3.1.2, the separation distance shall be not less than one-third of the length of the maximum overall diagonal dimension of the area served.”

#### Travel distance

**BC §1017.2 Limitations** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-173961))

> “Exit access travel distance shall not exceed the values given in Table 1017.2.”

**BC Table 1017.2 Exit access travel distance (ft), without / with sprinkler system** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-173961))

> A — see Section 1029.7 · B — 200 / 300 (sprinklered per 903.3.1.1) · E, F-1, M, R, S-1 — 150 / 200

**BC §1029.7 Travel distance** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-174480))

> “Exits and aisles shall be so located such that the travel distance to an exit door shall be provided in accordance with Table 1029.7. At least one exit door shall be available from every attached seat or standee space in an assembly space, or from the most remote point in the space when movable seats are provided or, when no seats are provided, within the primary travel distance limitation listed in Table 1029.7. In addition, an alternate exit door shall be available from every attached seat or standee space, or from the most remote point when attached seats are not provided within the secondary travel distance limitation listed in Table 1029.7. …”

**BC Table 1029.7 Travel distance (ft): non-sprinklered primary / secondary, sprinklered primary / secondary** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-174480))

> A-1, A-2, A-3, A-4 — 100 / 150, 150 / 250 · A-5 — 200 / 300, 200 / 300

**BC §404.9 Exit access travel distance** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_Chapter04_SpecialUseWBwm.pdf))

> “Exit access travel distance for areas open to an atrium shall comply with the requirements of this section.”

**BC §404.9.3** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_Chapter04_SpecialUseWBwm.pdf))

> “Where the path of egress travel is not at the level of exit discharge from the atrium, that portion of the total permitted exit access travel distance that occurs within the atrium shall be not greater than 200 feet (60 960 mm).”

#### Common path and dead ends

**BC §1006.2.1 Egress based on occupant load and common path of egress travel distance** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-173045))

> “Two exits or exit access doorways from any space shall be provided where the design occupant load or the common path of egress travel distance exceeds the values listed in Table 1006.2.1.”

**BC Table 1006.2.1 (rows used, sprinklered common path; column reading to be verified)** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-173045))

> A, E, M — maximum occupant load of space 74, common path 75 ft · B — 74, 100 ft

**BC §1020.4 Dead ends** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-174057))

> “Where more than one exit or exit access doorway is required, the exit access shall be arranged such that there are no dead ends in corridors more than 20 feet (6096 mm) in length. …”

#### High-rise

**BC §403.5.4 Smokeproof enclosures** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_Chapter04_SpecialUseWBwm.pdf))

> “Every required interior exit stairway serving floors more than 75 feet (22 860 mm) above the lowest level of fire department vehicle access shall comply with Sections 909.20 and 1023.11. Exception: Smokeproof enclosures are not required in occupancy Group R-2 unless provided pursuant to Exception 2 of Section 917.1.”

**BC §403.4.6 Fire command** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_Chapter04_SpecialUseWBwm.pdf))

> “A fire command center complying with Section 911 shall be provided in a location approved by the Fire Department.”

#### Fire service access elevator

**BC §403.6.1 Fire service access elevator** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_Chapter04_SpecialUseWBwm.pdf))

> “In buildings with an occupied floor more than 120 feet (36 576 mm) above the lowest level of fire department vehicle access, a minimum of one fire service access elevator shall be provided in accordance with Section 3007.”

**BC §3007.1 General** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_Chapter30_ElevatorsWBwm.pdf))

> “Where required by Section 403.6.1, every floor of the building shall be served by a fire service access elevator complying with Sections 3007.1 through 3007.8. Except as modified in this section, the fire service access elevator shall be installed in accordance with this chapter and ASME A17.1/CSA B44 as modified by Appendix K, Chapter K1.”

#### Stairway to roof

**BC §1011.12 Stairway to roof and roof access** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-173697))

> “In buildings four or more stories or more than 40 feet (12 192 mm) in height above grade, one stairway shall extend to the roof surface through a stairway bulkhead complying with Section 1510.2, unless the roof has a slope steeper than 20 degrees (0.35 rad). …”

#### Atrium, special amusement, mixed occupancy

**BC §411.1 General** ([source](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-167477))

> “Special amusement buildings having an occupant load of 75 or more shall comply with the requirements for the appropriate Group A occupancy and Sections 411.1 through 411.8. Special amusement buildings having an occupant load of less than 75 shall comply with the requirements for a Group B occupancy and Sections 411.1 through 411.8. …”

**BC §508.4 Separated occupancies** ([source](https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_Chapter05_HeightAreaWBwm.pdf))

> “Buildings or portions of buildings that comply with the provisions of this section shall be considered as separated occupancies.”
