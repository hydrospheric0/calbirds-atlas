// Shared request-guard for /api/* endpoints.
//
// Cloudflare's WAF should be the first line of defence (geo-block, BIC,
// rate-limit). This helper is a defence-in-depth measure: it rejects API
// requests that don't look like they're coming from one of our own pages,
// so direct curl/scraper hits return 403 even if WAF rules are off.
//
// Acceptance rule:
//   - Origin header (sent by browsers on cross-origin or POST/CORS requests)
//     OR Referer header (sent by browsers on same-origin GETs) must match
//     one of the allow-listed origins.
//   - If neither header is present, the request is rejected. Real browsers
//     navigating to a Pages site always send at least Referer for sub-resource
//     fetches; only command-line tools / bots omit both.

export const ALLOWED_ORIGINS = [
  'https://atlas.calbirds.org',
  'https://calbirds.org',
  'https://www.calbirds.org',
  'https://calbirds-atlas.pages.dev',
];

// Matches the production set above plus any *.calbirds-atlas.pages.dev preview
// (per-branch and per-deploy URLs Cloudflare auto-generates).
const PREVIEW_HOST_RE = /^https:\/\/[a-z0-9-]+\.calbirds-atlas\.pages\.dev$/i;

export function isAllowedOrigin(value) {
  if (!value) return false;
  if (ALLOWED_ORIGINS.includes(value)) return true;
  return PREVIEW_HOST_RE.test(value);
}

export function getRequestOrigin(request) {
  const explicit = request.headers.get('Origin');
  if (explicit && explicit !== 'null') return explicit;
  // Fall back to the origin component of the Referer header.
  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch (_) { /* malformed Referer */ }
  }
  return '';
}

// Returns null on accept; returns a Response (403) on reject.
export function rejectIfNotAllowed(request) {
  const origin = getRequestOrigin(request);
  if (isAllowedOrigin(origin)) return null;
  return new Response(JSON.stringify({ error: 'Forbidden' }), {
    status: 403,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export function corsHeaders(contentType, requestOrigin, cacheControl = 'public, max-age=3600') {
  const origin = isAllowedOrigin(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Cache-Control': cacheControl,
    // Generic hardening
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}
