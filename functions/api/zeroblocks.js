// Cloudflare Pages Function: returns all zero-effort CA atlas blocks as GeoJSON.
// Fetches once from Cornell WFS and caches at the edge for 6 hours.

const WFS_BASE = 'https://geowebcache.ornith.cornell.edu/geoserver/wfs';
const PROJ_PERIOD = 'EBIRD_ATL_CA_2026';

const ALLOWED_ORIGINS = [
  'https://calbirds.org',
  'https://www.calbirds.org',
  'https://calbirds-atlas.pages.dev',
];

export async function onRequestGet(context) {
  const requestOrigin = context.request.headers.get('Origin') || '';

  const cql = `num_complete=0 AND year_period='all' AND month_period='all' AND proj_period_id='${PROJ_PERIOD}'`;

  const wfsUrl = new URL(WFS_BASE);
  wfsUrl.searchParams.set('SERVICE', 'WFS');
  wfsUrl.searchParams.set('VERSION', '2.0.0');
  wfsUrl.searchParams.set('REQUEST', 'GetFeature');
  wfsUrl.searchParams.set('typeName', 'clo:BBA_CA_EFFORT_MAP');
  wfsUrl.searchParams.set('count', '5000');
  wfsUrl.searchParams.set('CQL_FILTER', cql);
  wfsUrl.searchParams.set('outputFormat', 'application/json');

  try {
    const upstream = await fetch(wfsUrl.toString(), {
      headers: { 'User-Agent': 'CalBirds-Atlas/1.0 (calbirds.org)' },
      cf: { cacheTtl: 21600, cacheEverything: true },
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}` }), {
        status: 502,
        headers: corsHeaders('application/json', requestOrigin),
      });
    }

    // GeoServer WFS returns coordinates in correct GeoJSON [lng, lat] order already
    const geojson = await upstream.json();
    return new Response(JSON.stringify(geojson), {
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
  const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Cache-Control': 'public, max-age=300',
  };
}
