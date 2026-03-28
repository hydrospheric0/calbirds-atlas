(async () => {
    try {
        const res = await fetch("https://geowebcache.ornith.cornell.edu/geoserver/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typeName=clo:BBA_CA_EFFORT_MAP&count=1&CQL_FILTER=num_complete%3D0&outputFormat=application%2Fjson");
        const data = await res.json();
        console.log(JSON.stringify(data.features[0].geometry).substring(0, 200));
    } catch(e) {
        console.error(e);
    }
})();
