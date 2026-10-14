# DD-G01 HYPEROBJECT — MEP Designer

Browser-based Design Development (DD) tool that generates draft **HVAC, plumbing, electrical, fire-protection and AV** systems for the *Hyperobject Media Museum* (260 12th Avenue, Manhattan), directly from the Rhino massing, core and structure models.

It reads FBX exports, applies code-derived sizing rules (NYC Building / Mechanical / Plumbing / Electrical codes, ASHRAE 62.1, NFPA 13/14/20), routes risers and distribution through the modelled shafts and cores, and shows every result in an interactive 3D viewer with schedules, checks and Rhino export.

![Roof plant and equipment tags](docs/screenshot-roof-plant.png)

> **DD coordination tool only.** Results are rules-of-thumb and code-based estimates for spatial coordination. They do not replace engineered calculations or a permit compliance review by licensed NYC MEP/FP engineers.

## Features

- **Model-driven** – levels, slab outlines, program volumes, cores, shafts, stairs, elevators, restrooms, fixtures and basement plant rooms are read from FBX layers.
- **HVAC** – ventilation-rate procedure per zone, cooling/heating loads, supply grids for open-plan spaces, floor AHUs or central roof AHUs, tapering risers, roof plant packed into the technical space.
- **Immersive halls** – ceiling projector rings covering every wall, AV racks, projector heat added to cooling and electrical loads.
- **Plumbing** – fixtures counted from the restroom model and checked against NYC PC Table 403.1, WSFU/DFU sizing, booster pumps and pressure zones, storm leaders, vent through roof.
- **Electrical** – connected/demand load, service size, busway and emergency risers, generator sizing, office workstation loads.
- **Fire** – sprinkler layout by hazard class, one standpipe per stair, fire pump sizing.
- **Coordination checks** – shaft capacity (shafts grow automatically if risers do not fit), ceiling clear height, plant fit, fixtures provided vs required, high-rise triggers.
- **Life safety page** (`web/ls.html`, header switch *Structure / MEP / Life safety / Energy*) – a separate 3D page with its own layer list (exit stairs, smokeproof vestibules, egress paths, worst travel distance, exit separation, elevator cars, fire service access elevator candidates and lobby, standpipes and roof manifold, fire command center placeholder, atrium / §411 / §508.4 overlays, basement exits) and a right panel with Summary cards (building-wide pass counts; click for verbatim NYC code text and the calculation for every storey or space), Floors, Stairs, Elevators, Checks and Inspector. Stairs come from `01_STAIRS`, elevator cars and lobbies are clustered from `02_PASSENGER_ELEVATORS`, `03_FREIGHT_ELEVATOR` and `04_LOBBY_AREAS` in the core model, so new or moved cores update after a re-export and `python tools/build_data.py`.
- **Structure page** (`web/st.html`) – the structure model on its own page, one layer group per top-level FBX layer, with slabs and programme volumes as context, a structure opacity slider, floor filter, click-to-inspect members and Summary, Layers and Inspector tabs. The model loads from `data/structure-data.js` on opening the page.
- **Code basis on the Summary tab** – click any summary figure to dim the others and show its NYC code reference and the formula with the current numbers; drag the inner edge of either side panel to resize it (double-click to reset).
- **Viewer** – Rhino-style collapsible layer trees (program volumes, MEP systems), ghosted cores and restrooms, floor and basement filters, explode, click-to-inspect rooms and elements, editable assumptions.
- **Exports** – Rhino `.3dm` (nested layers, centerlines, user text), OBJ, CSV floor schedule, JSON model, PNG at 4K / 8K.

## Quick start

Requires **Python 3** (no extra packages) and an internet connection (three.js and rhino3dm load from jsDelivr).

```bash
python tools/serve.py            # opens http://localhost:8765/web/
```

Or serve the repo root with any static server (e.g. `python -m http.server 8765`) and open `/web/`. The **Doc** button in the viewer renders this README and the methodology.

### GitHub Pages

Before each deploy, bump `APP_V` (and every `?v=`) in `web/index.html`, `web/ls.html` and `web/st.html`, plus the `?v=` on the import lines at the top of `web/app.js`, `web/ls-app.js` and `web/st-app.js`, so browsers load the new files instead of cached ones.

Settings → Pages → **Deploy from a branch** → `main` / `(root)`. The root `index.html` redirects to the viewer in `web/` (the empty `.nojekyll` file disables Jekyll processing).
Alternatively use **GitHub Actions** as source with `docs/github-pages-workflow.yml` copied to `.github/workflows/pages.yml`.

## Updating the model

1. Export from Rhino as FBX (units: metres, Z up) into `models/`, keeping the file and layer names below.
2. Rebuild the browser data:

```bash
python tools/build_data.py
```

| File | Layers read |
|---|---|
| `models/261004_base-program.fbx` | `slab-cut` (or `slabs`), program layers (`immersive spaces/gallery`, `exhibition/gallery`, `food-court - events`, `lobby/cafe/cloakroom`, `musem shop - library`, `OFFICES`, `auditorium`, `terrace`, `roof-technical-space`), `CORES`, `shaft`, `RESTROOM`, `basement`, `technical_room_availability_basement` |
| `models/261004_core_restroom_mod.fbx` | `00_CORES/*` (walls, stairs, elevators, lobbies) and `00_restrooms-column/*`; fixtures are counted by object name (`WC bowl`, `Lavatory`, `Service sink`, `urinal`, `fountain`) |
| `models/*structure*.fbx` | any layer tree; the top-level layers become layer groups on the Structure page (newest matching file is used) |

## Repository structure

```
web/                 static viewer (deployable as-is)
  index.html         MEP page (UI shell)
  ls.html            Life safety page
  st.html            Structure page
  en.html            Energy page (work in progress)
  style.css          shared styles
  app.js             three.js viewer, layer trees, inspector, exports
  engine.js          generation, sizing rules, checks (all defaults live here)
  ls-app.js          Life safety viewer, layers, panels
  st-app.js          Structure viewer, layers, panels
  en-app.js          Energy viewer (placeholder: slabs and programme as context)
  lifesafety.js      life-safety / egress checks (pure JS, derived from the model data)
  ls-codes.js        verbatim NYC code text shown in the Life safety Summary cards
  scrollers.js       hover-to-scroll arrows for the side panels and tab strip (all pages)
  layers-ui.js       layer list layout and collapsible group headings (all pages)
  export3d.js        Rhino .3dm and OBJ export of the visible scene (Structure and Life safety pages)
  data/              generated by tools/build_data.py — do not edit by hand
docs/
  METHODOLOGY.md     sizing rules and assumptions
  CODE_REVIEW_LOG.md DD code review record (findings, fixes, code text, open items)
tools/
  build_data.py      FBX → web/data/*.js (pure Python)
  fbxparse.py        dependency-free binary FBX reader
  serve.py           local server on :8765
models/              Rhino FBX exports (source geometry)
docs/
  METHODOLOGY.md     sizing rules, code basis, assumptions
```

## Status

DD draft v0.5. See [docs/METHODOLOGY.md](docs/METHODOLOGY.md) for the rules and the open inputs that will make the results more precise.

## Credits

Mattia — SCI-Arc MArchII, AS3222 Design Development, Fall 2026.
