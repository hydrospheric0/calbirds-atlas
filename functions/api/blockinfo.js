// Cloudflare Pages Function: proxies the Cornell GeoServer WFS request
// to avoid CORS restrictions. Accepts either:
//   /api/blockinfo?code=ABC123       (preferred — stable cache key per block)
//   /api/blockinfo?lat=...&lng=...   (legacy fallback for taps outside any cached geometry)

import { rejectIfNotAllowed, getRequestOrigin, corsHeaders } from './_guard.js';

const WFS_BASE = 'https://geowebcache.ornith.cornell.edu/geoserver/wfs';
const PROJ_PERIOD = 'EBIRD_ATL_CA_2026';

export async function onRequestGet(context) {
  const denied = rejectIfNotAllowed(context.request);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const requestOrigin = getRequestOrigin(context.request);
  const code = url.searchParams.get('code');

  let cql;
  if (code) {
    if (!/^[A-Za-z0-9]{1,32}$/.test(code)) {
      return new Response(JSON.stringify({ error: 'Invalid block_code' }), {
        status: 400,
        headers: corsHeaders('application/json', requestOrigin),
      });
    }
    cql = `block_code='${code}' AND year_period='all' AND month_period='all' AND proj_period_id='${PROJ_PERIOD}'`;
  } else {
    const lat = parseFloat(url.searchParams.get('lat'));
    const lng = parseFloat(url.searchParams.get('lng'));

    if (isNaN(lat) || isNaN(lng) || lat < 32 || lat > 43 || lng < -125 || lng > -113) {
      return new Response(JSON.stringify({ error: 'Invalid or out-of-range coordinates' }), {
        status: 400,
        headers: corsHeaders('application/json', requestOrigin),
      });
    }
    // CQL: INTERSECTS with lat,lon ordering for WFS 2.0 EPSG:4326
    cql = `INTERSECTS(geometry,POINT(${lat} ${lng})) AND year_period='all' AND month_period='all' AND proj_period_id='${PROJ_PERIOD}'`;
  }

  const wfsUrl = new URL(WFS_BASE);
  wfsUrl.searchParams.set('SERVICE', 'WFS');
  wfsUrl.searchParams.set('VERSION', '2.0.0');
  wfsUrl.searchParams.set('REQUEST', 'GetFeature');
  wfsUrl.searchParams.set('typeName', 'clo:BBA_CA_EFFORT_MAP');
  wfsUrl.searchParams.set('count', '5');
  wfsUrl.searchParams.set('CQL_FILTER', cql);
  wfsUrl.searchParams.set('outputFormat', 'application/json');

  try {
    const upstream = await fetchWithRetry(wfsUrl.toString(), {
      headers: { 'User-Agent': 'CalBirds-Atlas/1.0 (calbirds.org)' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}` }), {
        status: 502,
        headers: corsHeaders('application/json', requestOrigin),
      });
    }

    const body = await upstream.text();
    return new Response(body, {
      status: 200,
      headers: corsHeaders('application/json', requestOrigin),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Upstream fetch failed' }), {
      status: 502,
      headers: corsHeaders('application/json', requestOrigin),
    });
  }
}

// Single-retry wrapper for transient WFS hiccups (Cornell GeoServer occasionally
// returns 502s); one quick retry recovers most of them without user-visible error.
async function fetchWithRetry(url, init, { retries = 1, backoffMs = 300 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (res.ok || res.status < 500) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
    }
  }
  throw lastErr || new Error('fetch failed');
}
