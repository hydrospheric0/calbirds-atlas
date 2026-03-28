import geopandas as gpd

print("Reading...")
gdf = gpd.read_file('data/ca_bba_blocks.geojson')
print("Read", len(gdf), "rows")

print("Simplifying...")
# tolerance 0.005 degrees ~ 500m which is fine for zoom 8-10.
# but these are blocks (squarish), so Douglas-Peucker preserves them well.
# Let's use tolerance=0.002
gdf['geometry'] = gdf['geometry'].simplify(0.002, preserve_topology=True)

print("Saving...")
gdf.to_file('mobile/data/ca_bba_blocks_simple.geojson', driver='GeoJSON')
print("Done!")
