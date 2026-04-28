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
// v2: tightened CQL — exclude blocks with any effort, not just complete-checklist count.
const KV_KEY = 'zeroblocks_v2';
const STALE_AFTER_S = 12 * 3600; // serve stale, refresh in background after 12 h
const WFS_TIMEOUT_MS = 25000;
// A block is "zero effort" only when no complete checklists, no coded species,
// AND no logged hours. This excludes blocks with incidental/incomplete checklists.
const ZERO_EFFORT_CQL_BASE = `num_complete=0 AND num_coded=0 AND total_hours=0`;

const ALLOWED_ORIGINS = [
  'https://calbirds.org',
  'https://www.calbirds.org',
  'https://calbirds-atlas.pages.dev',
];

export async function onRequestGet(context) {
  const { env, request, waitUntil } = context;
  const requestOrigin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  const summaryOnly = url.searchParams.get('summary') === '1';

  // ── 1. Fast path: serve from KV ──────────────────────────────
  if (env.ATLAS_KV) {
    try {
      const { value, metadata } = await env.ATLAS_KV.getWithMetadata(KV_KEY, 'text');
      if (value) {
        let parsed = null;
        try {
          parsed = JSON.parse(value);
        } catch (_) { /* serve raw KV value below */ }

        const ageS = Date.now() / 1000 - (metadata?.fetchedAt || 0);
        const looksTruncated = Array.isArray(parsed) && parsed.length === 10000;
        const cachedTotal = Number(metadata?.total);

        if (summaryOnly) {
          if (Number.isFinite(cachedTotal) && cachedTotal > 0) {
            return new Response(JSON.stringify({ total: cachedTotal }), {
              status: 200,
              headers: corsHeaders('application/json', requestOrigin),
            });
          }
          if (looksTruncated) {
            const liveTotal = await fetchZeroBlockTotalFromWfs();
            if (Number.isFinite(liveTotal) && liveTotal > 0) {
              waitUntil(
                env.ATLAS_KV.put(KV_KEY, value, {
                  metadata: {
                    fetchedAt: metadata?.fetchedAt || Math.floor(Date.now() / 1000),
                    total: liveTotal,
                  },
                })
              );
              return new Response(JSON.stringify({ total: liveTotal }), {
                status: 200,
                headers: corsHeaders('application/json', requestOrigin),
              });
            }
          }
          const fallbackTotal = Array.isArray(parsed) ? parsed.length : null;
          return new Response(JSON.stringify({ total: fallbackTotal }), {
            status: 200,
            headers: corsHeaders('application/json', requestOrigin),
          });
        }

        if (looksTruncated) {
          const refreshed = await fetchFromWfs();
          if (refreshed) {
            const refreshedValue = JSON.stringify(refreshed);
            waitUntil(
              env.ATLAS_KV.put(KV_KEY, refreshedValue, {
                metadata: {
                  fetchedAt: Math.floor(Date.now() / 1000),
                  total: refreshed.length,
                },
              })
            );
            return new Response(refreshedValue, {
              status: 200,
              headers: corsHeaders('application/json', requestOrigin),
            });
          }
          waitUntil(writeToKv(env.ATLAS_KV));
        } else if (ageS > STALE_AFTER_S) {
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
  if (summaryOnly) {
    const total = await fetchZeroBlockTotalFromWfs();
    if (!Number.isFinite(total)) {
      return new Response(JSON.stringify({ error: 'Upstream WFS fetch failed' }), {
        status: 502,
        headers: corsHeaders('application/json', requestOrigin),
      });
    }
    return new Response(JSON.stringify({ total }), {
      status: 200,
      headers: corsHeaders('application/json', requestOrigin),
    });
  }

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
        metadata: {
          fetchedAt: Math.floor(Date.now() / 1000),
          total: blocks.length,
        },
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
    metadata: {
      fetchedAt: Math.floor(Date.now() / 1000),
      total: blocks.length,
    },
  });
}

async function fetchZeroBlockTotalFromWfs() {
  const CQL = `${ZERO_EFFORT_CQL_BASE} AND year_period='all' AND month_period='all' AND proj_period_id='${PROJ_PERIOD}'`;
  const wfsUrl = new URL(WFS_BASE);
  wfsUrl.searchParams.set('SERVICE', 'WFS');
  wfsUrl.searchParams.set('VERSION', '2.0.0');
  wfsUrl.searchParams.set('REQUEST', 'GetFeature');
  wfsUrl.searchParams.set('typeName', 'clo:BBA_CA_EFFORT_MAP');
  wfsUrl.searchParams.set('count', '10');
  wfsUrl.searchParams.set('startIndex', '0');
  wfsUrl.searchParams.set('CQL_FILTER', CQL);
  wfsUrl.searchParams.set('propertyName', 'block_code');
  wfsUrl.searchParams.set('outputFormat', 'application/json');

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), WFS_TIMEOUT_MS);
  try {
    const res = await fetch(wfsUrl.toString(), {
      headers: { 'User-Agent': 'CalBirds-Atlas/1.0 (calbirds.org)' },
      signal: controller.signal,
      cf: { cacheTtl: 21600, cacheEverything: true },
    });
    if (!res.ok) return null;
    const geojson = await res.json();
    const matched = Number(geojson.numberMatched ?? geojson.totalFeatures);
    return Number.isFinite(matched) ? matched : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

async function fetchFromWfs() {
  const PAGE_SIZE = 2000;
  const CQL = `${ZERO_EFFORT_CQL_BASE} AND year_period='all' AND month_period='all' AND proj_period_id='${PROJ_PERIOD}'`;
  const all = [];
  const seen = new Set();
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
      if (!res.ok) return null;
      geojson = await res.json();
    } catch (_) {
      return null;
    } finally {
      clearTimeout(tid);
    }

    const page = (geojson.features || []).map(f => f.properties?.block_code).filter(Boolean);
    for (const code of page) {
      if (seen.has(code)) continue;
      seen.add(code);
      all.push(code);
    }

    const matched = Number(geojson.numberMatched);
    const returned = Number(geojson.numberReturned);
    if (Number.isFinite(matched) && Number.isFinite(returned)) {
      if (startIndex + returned >= matched) break;
    } else if (page.length < PAGE_SIZE) {
      break;
    }

    if (!page.length) break;
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
