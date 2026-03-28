const WFS_BASE = 'https://geowebcache.ornith.cornell.edu/geoserver/wfs';
const PROJ_PERIOD = 'EBIRD_ATL_CA_2026';
(async () => {
  const cql = `num_complete=0 AND year_period='all' AND month_period='all' AND proj_period_id='${PROJ_PERIOD}'`;
  const wfsUrl = new URL(WFS_BASE);
  wfsUrl.searchParams.set('SERVICE', 'WFS');
  wfsUrl.searchParams.set('VERSION', '2.0.0');
  wfsUrl.searchParams.set('REQUEST', 'GetFeature');
  wfsUrl.searchParams.set('typeName', 'clo:BBA_CA_EFFORT_MAP');
  wfsUrl.searchParams.set('count', '10');
  wfsUrl.searchParams.set('CQL_FILTER', cql);
  wfsUrl.searchParams.set('propertyName', 'block_code');
  wfsUrl.searchParams.set('outputFormat', 'application/json');

  try {
    const res = await fetch(wfsUrl);
    const data = await res.json();
    console.log("Has features:", Boolean(data.features));
    const zeroBlocks = (data.features || []).map(f => f.properties && f.properties.block_code).filter(Boolean);
    console.log(zeroBlocks);
  } catch(e) {
    console.error(e);
  }
})();
