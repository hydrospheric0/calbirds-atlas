// Cloudflare Pages Function: proxies the Cornell GeoServer WFS request
// to avoid CORS restrictions. Available at /api/blockinfo?lat=...&lng=...

const WFS_BASE = 'https://geowebcache.ornith.cornell.edu/geoserver/wfs';
const PROJ_PERIOD = 'EBIRD_ATL_CA_2026';

// Allowed origins for CORS (production + Cloudflare Pages preview)
const ALLOWED_ORIGINS = [
  'https://calbirds.org',
  'https://www.calbirds.org',
  'https://calbirds-atlas.pages.dev',
];

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const requestOrigin = context.request.headers.get('Origin') || '';
  const lat = parseFloat(url.searchParams.get('lat'));
  const lng = parseFloat(url.searchParams.get('lng'));

  if (isNaN(lat) || isNaN(lng) || lat < 32 || lat > 43 || lng < -125 || lng > -113) {
    return new Response(JSON.stringify({ error: 'Invalid or out-of-range coordinates' }), {
      status: 400,
      headers: corsHeaders('application/json', requestOrigin),
    });
  }

  // CQL: INTERSECTS with lat,lon ordering for WFS 2.0 EPSG:4326
  const cql = `INTERSECTS(geometry,POINT(${lat} ${lng})) AND year_period='all' AND month_period='all' AND proj_period_id='${PROJ_PERIOD}'`;

  const wfsUrl = new URL(WFS_BASE);
  wfsUrl.searchParams.set('SERVICE', 'WFS');
  wfsUrl.searchParams.set('VERSION', '2.0.0');
  wfsUrl.searchParams.set('REQUEST', 'GetFeature');
  wfsUrl.searchParams.set('typeName', 'clo:BBA_CA_EFFORT_MAP');
  wfsUrl.searchParams.set('count', '5');
  wfsUrl.searchParams.set('CQL_FILTER', cql);
  wfsUrl.searchParams.set('outputFormat', 'application/json');

  try {
    const upstream = await fetch(wfsUrl.toString(), {
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

function corsHeaders(contentType, requestOrigin) {
  // Allow production domains; fall back to first allowed origin for non-matching requests
  const origin = ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Cache-Control': 'public, max-age=3600',
  };
}
