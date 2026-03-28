(async () => {
    try {
        const res = await fetch("https://calbirds-atlas.pages.dev/data/ca_bba_blocks.geojson");
        console.log(res.status, res.headers.get('content-type'));
    } catch(e) {
        console.error(e);
    }
})();
