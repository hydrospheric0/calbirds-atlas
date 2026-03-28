(async () => {
    try {
        const res = await fetch("https://calbirds-atlas.pages.dev/api/zeroblocks?v=3"); // or calbirds.org
        const data = await res.json();
        console.log(Array.isArray(data));
        console.log(JSON.stringify(data).substring(0, 100));
    } catch(e) {
        console.error(e);
    }
})();
