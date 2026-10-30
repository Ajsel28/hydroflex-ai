// Extracts Albania and its neighbours from Natural Earth 1:50m (world-atlas countries-50m)
// into a small GeoJSON FeatureCollection consumed by the map. Real geography, no hand-drawn shapes.
// Usage: npm run geo
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));
const wanted = { '008': 'Albania', '499': 'Montenegro', '807': 'North Macedonia', '300': 'Greece', '688': 'Serbia', '380': 'Italy', '070': 'Bosnia and Herzegovina', '191': 'Croatia', '100': 'Bulgaria' };
const fc = feature(topo, topo.objects.countries);
const round = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4] : c.map(round));
const out = {
  type: 'FeatureCollection',
  source: 'Natural Earth 1:50m via world-atlas@2 (countries-50m.json), public domain',
  features: fc.features
    .filter((f) => wanted[f.id] || f.properties.name === 'Kosovo')
    .map((f) => ({
      type: 'Feature',
      id: f.id ?? 'XKX',
      properties: { name: wanted[f.id] ?? f.properties.name, focus: f.id === '008' },
      geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
    })),
};
writeFileSync(new URL('../src/components/map/balkans.geo.json', import.meta.url), JSON.stringify(out));
console.log('wrote', out.features.map((f) => f.properties.name).join(', '));
