// Cloudflare Pages Function: returns atlas blocks within a bounding box.
// Accepts ?bbox=minLat,minLng,maxLat,maxLng (EPSG:4326, WGS84).
// Returns all blocks in that area; client filters for num_complete===0.
// Coordinates are corrected from WFS [lat,lng] to GeoJSON [lng,lat].

const WFS_BASE = 'https://geowebcache.ornith.cornell.edu/geoserver/wfs';
const PROJ_PERIOD = 'EBIRD_ATL_CA_2026';

const ALLOWED_ORIGINS = [
  'https://calbirds.org',
  'https://www.calbirds.org',
  'https://calbirds-atlas.pages.dev',
];

// Snap a value outward (toward -inf for min, +inf for max) to nearest grid step.
// This improves Cloudflare edge cache hit rates for nearby/overlapping viewports.
const GRID = 0.25; // 0.25° grid (~27km)

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const requestOrigin = context.request.headers.get('Origin') || '';

  const bboxParam = url.searchParams.get('bbox');
  if (!bboxParam) {
    return new Response(JSON.stringify({ error: 'Missing bbox parameter' }), {
      status: 400,
      headers: corsHeaders('application/json', requestOrigin),
    });
  }

  const parts = bboxParam.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    return new Response(JSON.stringify({ error: 'Invalid bbox. Use minLat,minLng,maxLat,maxLng' }), {
      status: 400,
      headers: corsHeaders('application/json', requestOrigin),
    });
  }

  let [minLat, minLng, maxLat, maxLng] = parts;

  // Clamp to CA extent and validate
  minLat = Math.max(32, minLat);
  maxLat = Math.min(43, maxLat);
  minLng = Math.max(-125, minLng);
  maxLng = Math.min(-113, maxLng);

  if (minLat >= maxLat || minLng >= maxLng) {
    return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), {
      status: 200,
      headers: corsHeaders('application/json', requestOrigin),
    });
  }

  // Snap outward to grid for better cache utilisation
  const snapMin = (v) => Math.floor(v / GRID) * GRID;
  const snapMax = (v) => Math.ceil(v / GRID) * GRID;
  const sMinLat = snapMin(minLat);
  const sMaxLat = snapMax(maxLat);
  const sMinLng = snapMin(minLng);
  const sMaxLng = snapMax(maxLng);

  // When zeroOnly=1, restrict to unvisited blocks and fetch more of them
  const zeroOnly = url.searchParams.get('zeroOnly') === '1';

  // GeoServer CQL BBOX uses (lng, lat) / (x, y) order regardless of EPSG:4326 axis convention
  let cql = `BBOX(geometry,${sMinLng},${sMinLat},${sMaxLng},${sMaxLat},'EPSG:4326') AND year_period='all' AND month_period='all' AND proj_period_id='${PROJ_PERIOD}'`;
  if (zeroOnly) cql += ` AND num_complete = 0`;

  const wfsUrl = new URL(WFS_BASE);
  wfsUrl.searchParams.set('SERVICE', 'WFS');
  wfsUrl.searchParams.set('VERSION', '2.0.0');
  wfsUrl.searchParams.set('REQUEST', 'GetFeature');
  wfsUrl.searchParams.set('typeName', 'clo:BBA_CA_EFFORT_MAP');
  // zeroOnly queries return far fewer features per bbox — use a higher cap
  wfsUrl.searchParams.set('count', zeroOnly ? '2000' : '500');
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
    'Cache-Control': 'public, max-age=3600',
  };
}
