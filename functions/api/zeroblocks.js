// Cloudflare Pages Function: returns all zero-effort CA atlas block codes as a JSON array.
//
// Strategy: stale-while-revalidate backed by KV.
//   1. Read from KV (ATLAS_KV) → instant response on every request after the first.
//   2. If KV data is older than STALE_AFTER_S, fire a background refresh (waitUntil)
//      so the *next* caller gets fresh data.
//   3. Cold start (empty KV): fall back to a direct WFS fetch (blocking) then populate KV.
//
// KV namespace must be bound as ATLAS_KV in wrangler.toml.

const WFS_BASE = 'https://geowebcache.ornith.cornell.edu/geoserver/wfs';
const PROJ_PERIOD = 'EBIRD_ATL_CA_2026';
const KV_KEY = 'zeroblocks_v1';
const STALE_AFTER_S = 12 * 3600; // serve stale, refresh in background after 12 h
const WFS_TIMEOUT_MS = 25000;

const ALLOWED_ORIGINS = [
  'https://calbirds.org',
  'https://www.calbirds.org',
  'https://calbirds-atlas.pages.dev',
];

export async function onRequestGet(context) {
  const { env, request, waitUntil } = context;
  const requestOrigin = request.headers.get('Origin') || '';

  // ── 1. Fast path: serve from KV ──────────────────────────────
  if (env.ATLAS_KV) {
    try {
      const { value, metadata } = await env.ATLAS_KV.getWithMetadata(KV_KEY, 'text');
      if (value) {
        const ageS = Date.now() / 1000 - (metadata?.fetchedAt || 0);
        if (ageS > STALE_AFTER_S) {
          // Return stale data immediately; refresh KV in the background
          waitUntil(writeToKv(env.ATLAS_KV));
        }
        return new Response(value, {
          status: 200,
          headers: corsHeaders('application/json', requestOrigin),
        });
      }
    } catch (_) { /* KV read failed — fall through to WFS */ }
  }

  // ── 2. Cold start: fetch directly from WFS ───────────────────
  const blocks = await fetchFromWfs();
  if (blocks === null) {
    return new Response(JSON.stringify({ error: 'Upstream WFS fetch failed' }), {
      status: 502,
      headers: corsHeaders('application/json', requestOrigin),
    });
  }

  const jsonStr = JSON.stringify(blocks);
  if (env.ATLAS_KV) {
    waitUntil(
      env.ATLAS_KV.put(KV_KEY, jsonStr, {
        metadata: { fetchedAt: Math.floor(Date.now() / 1000) },
      })
    );
  }

  return new Response(jsonStr, {
    status: 200,
    headers: corsHeaders('application/json', requestOrigin),
  });
}

// Called in background (waitUntil) to refresh KV without blocking the response.
async function writeToKv(kv) {
  const blocks = await fetchFromWfs();
  if (blocks === null) return; // WFS unavailable — keep serving the stale value
  await kv.put(KV_KEY, JSON.stringify(blocks), {
    metadata: { fetchedAt: Math.floor(Date.now() / 1000) },
  });
}

async function fetchFromWfs() {
  const PAGE_SIZE = 10000;
  const CQL = `num_complete=0 AND year_period='all' AND month_period='all' AND proj_period_id='${PROJ_PERIOD}'`;
  const all = [];
  let startIndex = 0;

  while (true) {
    const wfsUrl = new URL(WFS_BASE);
    wfsUrl.searchParams.set('SERVICE', 'WFS');
    wfsUrl.searchParams.set('VERSION', '2.0.0');
    wfsUrl.searchParams.set('REQUEST', 'GetFeature');
    wfsUrl.searchParams.set('typeName', 'clo:BBA_CA_EFFORT_MAP');
    wfsUrl.searchParams.set('count', String(PAGE_SIZE));
    wfsUrl.searchParams.set('startIndex', String(startIndex));
    wfsUrl.searchParams.set('CQL_FILTER', CQL);
    wfsUrl.searchParams.set('propertyName', 'block_code');
    wfsUrl.searchParams.set('outputFormat', 'application/json');

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), WFS_TIMEOUT_MS);
    let geojson;
    try {
      const res = await fetch(wfsUrl.toString(), {
        headers: { 'User-Agent': 'CalBirds-Atlas/1.0 (calbirds.org)' },
        signal: controller.signal,
        cf: { cacheTtl: 21600, cacheEverything: true },
      });
      if (!res.ok) return all.length ? all : null;
      geojson = await res.json();
    } catch (_) {
      return all.length ? all : null;
    } finally {
      clearTimeout(tid);
    }

    const page = (geojson.features || []).map(f => f.properties?.block_code).filter(Boolean);
    all.push(...page);

    // Stop if we got fewer than a full page (no more results)
    if (page.length < PAGE_SIZE) break;
    startIndex += PAGE_SIZE;
  }

  return all;
}

function corsHeaders(contentType, requestOrigin) {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Cache-Control': 'public, max-age=21600',
  };
}
