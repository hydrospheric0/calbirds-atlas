(async () => {
    try {
        const res = await fetch("https://calbirds-atlas.pages.dev/api/blockinfo?lat=37.8&lng=-122.4");
        const data = await res.json();
        console.log("Features found:", data.features ? data.features.length : data);
    } catch(e) {
        console.error(e);
    }
})();
