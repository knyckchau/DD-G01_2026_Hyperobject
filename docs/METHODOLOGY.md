# Methodology & assumptions

All defaults live in `web/engine.js` (`CATS`, `DEFAULTS`) and most are editable in the viewer's *Design assumptions* panel. Code references are the basis used for DD sizing and must be verified against the editions in force at filing.

## Spaces

| Space | Occupant load (ft²/p) | Rp / Ra (ventilation) | Lighting / plug (W/ft²) | Sprinkler hazard | Notes |
|---|---|---|---|---|---|
| Exhibition gallery | 30 net | 7.5 / 0.06 | 1.0 / 1.5 | Light | open plan, supply grid |
| Immersive hall | 30 net (5 net if used as standing event space) | 7.5 / 0.06 | 0.3 / 1 + AV | Light | 360° projection, see below |
| Auditorium | fixed seats (182, §1004.3); 7 net if chairs only | 5 / 0.06 | 0.8 / 4 | Light | |
| Food court / events | 15 net | 7.5 / 0.18 | 0.8 / 8 | Ordinary 1 | kitchen fixtures TBD |
| Lobby / café | 15 net | 5 / 0.06 | 0.8 / 1.5 | Light | open plan |
| Shop / library | 30 gross at grade, 60 gross other floors | 7.5 / 0.12 | 1.1 / 2 | Ordinary 2 | |
| Offices | 100 gross | 5 / 0.06 | 0.64 / 0.25 + desks | Light | 1 desk / 10 m², 150 W each |

Occupant loads follow NYC BC 2022 Table 1004.1.3 (egress basis, conservative for ventilation). The terrace is counted as A-3 for fixtures (NYC PC Table 403.1 note d includes outdoor areas). Ventilation: NYC MC §403 / ASHRAE 62.1 ventilation rate procedure, Ez = 0.8.

## HVAC
- Sensible load = envelope (Btuh/ft²) + people + lighting + plug/AV; supply air at ΔT 20 °F, minimum 0.4 cfm/ft².
- Concepts: **DOAS (ERV) on roof + floor-by-floor AHUs** with CHW/HHW risers (default), or **central roof AHUs** with supply/return shafts.
- Mains 1500 fpm, branches 900 fpm, risers 2000 fpm; max duct depth 30 in.
- Open-plan spaces get run-out grids every 6 m; multi-storey halls are served at their own ceiling.
- Plant: air-cooled/heat-recovery chillers (N+1), air-to-water heat pumps (all-electric, LL97), DOAS, pumps — packed into the roof technical space with 1 m clearance; pumps move to the basement if the roof is full.

## Immersive halls
- Projector columns = wall perimeter / (image width × (1 − overlap)); tiers = 90% of wall height / (image height × (1 − overlap)).
- Defaults: 8 × 5 m image, 15% edge blend, 2 kW per laser projector (~30k lm), 8 kW AV rack per hall.
- Supply diffusers inset ~4 m from projection walls, no sidewall grilles; high-level return over the projector ring.

## Plumbing
- Fixtures provided are counted from the restroom model; required per NYC PC 2022 Table 403.1 (50/50 split, no urinal substitution): A-1/A-3 WC 1:70 male / 1:35 female for the first 210 of each sex, then 1:125 / 1:65, lav 1:200, DF 1:500; A-2 WC 1:75, lav 1:200, DF 1:500; B stepped NYC counts (WC 1–20:1 … 141–190:6, +1 per 50; lav 1–25:1 … 116–160:5, +1 per 60; DF 1:100); M WC 1:500, lav 1:750, DF 1:1000.
- WSFU (total column: WC 10, lav 2, service sink 3, DF 0.25) → gpm with the flush-valve Hunter curve (Appendix E, Table E103.3(3)); stacks and branches per NYC PC Table 710.1(2); building drain per Table 710.1(1) at 1/8 in/ft; storm at 3 in/hr (NYC PC §1106.1), leaders per Table 1106.3.
- Domestic water: street pressure (assumed 45 psi) vs 25 psi at flush valves + elevation + friction + meter/RPZ → booster set in the basement and pressure zones ≤ 85 psi static (NYC PC §604.8).

## Electrical
- Connected load = lighting + plug/AV + HVAC (chillers, fans, pumps) + elevators + fire pump; demand factor 0.8, 25% spare, 480Y/277 V.
- Generator sized for life-safety and legally required standby loads (egress lighting, fire alarm, smoke control, fire pump, fire service elevator).

## Fire protection
- Sprinkler spacing 15 ft (light hazard, 225 ft², hydraulically calculated) / 11 ft (ordinary hazard, 121 ft² ≤ 130 ft² max, NFPA 13); heads only where the slab exists.
- One 6 in combined standpipe per modelled stair (NYC Appendix Q, > 150 ft); fire pump flow 500 gpm + 250 gpm per additional standpipe (max 1000, NFPA 14 §7.10), 65 psi at the roof manifold (NYC BC Appendix Q modification of NFPA 14 §7.8.1).

## Life safety (ls.html, lifesafety.js)
Recomputed from the model data whenever the page loads or an assumption changes; no floor, stair, core or elevator is hard-coded.
- Stairs: `01_STAIRS` clusters inside `CORES` (tools/build_data.py). A stair serves a floor when it spans that level (bottom ≤ floor + 1 m ≤ top). Stairs sharing a wall count as one exit (§1007.1.1).
- Elevators and lobbies: the core model layers `02_PASSENGER_ELEVATORS`, `03_FREIGHT_ELEVATOR`, `04_LOBBY_AREAS` are split into connected pieces and merged into vertical columns in the browser (`clusterDetail`). A small lobby touching a stair is its vestibule; a lobby touching cars is the elevator lobby. A car with an enclosed lobby that reaches the top occupied floor is an FSE candidate (§403.6.1, §3007.1).
- Exits required per floor: Table 1006.3.1 (1–500: 2, 501–1,000: 3, > 1,000: 4).
- Stair capacity: clear width (assumption, default 47.2 in = 1.2 m) ÷ 0.3 in/occupant, each storey on its own (§1005.3.1; no sprinkler reduction in NYC). Handrails do not reduce the width (§1005.7.2 → §1014.8).
- Separation: the farthest stair pair must be ≥ ⅓ of the floor's maximum overall diagonal (§1007.1.1 Exception 2, sprinklered). Edge-to-edge between enclosures (conservative) and centre-to-centre (passes only if doors are placed far apart).
- Egress routes run on the floor plate only: each slab is rasterised to a 0.2 m grid and paths are shortest walking routes on it (8-connected, no corner cutting, then string-pulled). No slab means no floor, so no passage. Core-model walls (`00_WALLS`, restroom `WALL`, `PARTITION`) are cut at floor + 1.0 m and block the route, so paths go through openings and turn at wall ends. Stair landings, vestibules and lobbies count as floor; elevator hoistways and MEP shafts do not. A stair is an exit on a floor only if such a route reaches its door. Programme rooms have no walls or doors in the model yet, so routes cross them until they are modelled.
- Routes start inside each programme space, at its most remote point (the footprint cell, on the floor plate, farthest by walking distance from any exit). Path of travel: from there to the nearest reachable stair door. Limits, sprinklered: Group A 150 ft primary / 250 ft secondary (§1029.7, Table 1029.7), M 200 ft and B 300 ft (Table 1017.2), 200 ft within an atrium (§404.9.3); > 80 % is flagged.
- Common path of egress travel (§1006.2.1, Table 1006.2.1; A and M 75 ft, B 100 ft sprinklered, column reading to verify): the part of that route shared with the route to a second, different exit: the straightened route is followed until it moves more than 0.5 m away from the second route, and the split point lies on the route, so common path and the rest of the path of travel are one line; with one reachable exit the whole route is common. Floor area with no route to any stair and stair doors that open onto no floor are reported.
- Smokeproof enclosures above 75 ft (§403.5.4): each stair needs a vestibule over its full height in the model; ventilation per §909.20 is not checked.
- Stairway to roof (§1011.12) and the roof manifold (Appendix Q, NFPA 14 §7.3.2.1); basement exits; fire command center (§403.4.6) as a placeholder at the grade lobby.
- Level of exit discharge (ground floor): exits to grade are not modelled and the floor is reported as info.
- Not checkable without doors and walls: common path (§1006.2.1), dead ends (§1020.4), corridor ratings.

## Shafts
- Risers are laid out in rows along the modelled shaft; a 10% allowance is added for access and fire-stopping.
- If risers do not fit, the shaft grows (southward) and the check reports the new outline to update in Rhino.

## Open inputs (highest impact first)
1. Floor AHU rooms and stacked electrical closets next to the main shaft.
2. Real design occupancy and AV equipment per immersive hall (projector model, throw, floor projection).
3. Floor-to-floor heights and structure depth (current clear height ≈ 2.7 m under services on 5 m floors).
4. Restroom strategy (L01 short of WCs, none on L11, drinking fountains).
5. Utility points of entry (street frontage for power, water, sewer, fire service).
6. Collections environmental classes, envelope performance, life-safety power strategy, code editions at filing.
