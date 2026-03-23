# CalBirds Atlas — California Breeding Bird Atlas Mobile App

A mobile-optimised web app for field use during the [California Breeding Bird Atlas (2021–2026)](https://ebird.org/atlascalifornia). Designed to help observers quickly find zero-effort blocks, check survey progress, and orient in the field.

**Live app:** [calbirds-atlas.pages.dev](https://calbirds-atlas.pages.dev)

See more projects at [hydrospheric0.github.io](https://hydrospheric0.github.io/).

---

## Features

- Interactive Leaflet.js map with Esri Topo, OSM, and Satellite basemaps
- eBird atlas effort heatmap overlaid from Cornell Lab tile server
- Block status overlay (complete/incomplete/priority) from Cornell Lab
- **Zero-effort block outlines** — purple outlines showing unvisited blocks in the current viewport, loaded on demand
- County outlines at zoom ≥ 10
- GPS location tracking with accuracy circle and block highlighting
- Block info panel: click any block to see effort hours, checklist counts, and block name/county
- Overlay opacity control

---

## Technical Stack

### Frontend
- Single-file SPA (`index.html`) — no build step required
- [Leaflet.js](https://leafletjs.com/) for interactive mapping
- Custom Leaflet panes for z-index control across tile and vector layers
- Responsive CSS with mobile-safe-area support

### Backend (Cloudflare Pages Functions)
Three serverless functions proxy requests to the Cornell Lab GeoServer WFS API, handling CORS and edge caching:

| Endpoint | Description |
|---|---|
| `/api/nearbyblocks` | Returns atlas blocks within a bbox; supports `?zeroOnly=1` to filter to unvisited blocks |
| `/api/zeroblocks` | Returns all zero-effort blocks statewide (legacy/fallback) |
| `/api/blockinfo` | Returns effort data for the block at a given lat/lng via `INTERSECTS` CQL query |

### Data Source
All block effort data is fetched live from the Cornell Lab GeoServer WFS:
- Layer: `clo:BBA_CA_EFFORT_MAP`
- CQL filters on `num_complete`, `year_period`, `month_period`, `proj_period_id`
- Responses are cached at the Cloudflare edge (5 min for viewport queries)

### Deployment
- Hosted on [Cloudflare Pages](https://pages.cloudflare.com/) — auto-deploys from `main` branch on GitHub push
- No build process; static files served directly with Cloudflare Pages Functions for serverless API routes

---

## Local Development

```bash
npm install
npm run dev   # starts wrangler pages dev on port 7711
```

Requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/).
