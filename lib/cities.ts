// Tiny offline geocoder for the geo pre-filter. Covers the demo personas and
// common US metros; unknown cities simply skip the distance check.
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  "san diego": { lat: 32.7157, lon: -117.1611 },
  "los angeles": { lat: 34.0522, lon: -118.2437 },
  "san francisco": { lat: 37.7749, lon: -122.4194 },
  seattle: { lat: 47.6062, lon: -122.3321 },
  portland: { lat: 45.5152, lon: -122.6784 },
  phoenix: { lat: 33.4484, lon: -112.074 },
  denver: { lat: 39.7392, lon: -104.9903 },
  billings: { lat: 45.7833, lon: -108.5007 },
  dallas: { lat: 32.7767, lon: -96.797 },
  houston: { lat: 29.7604, lon: -95.3698 },
  chicago: { lat: 41.8781, lon: -87.6298 },
  minneapolis: { lat: 44.9778, lon: -93.265 },
  "st. louis": { lat: 38.627, lon: -90.1994 },
  atlanta: { lat: 33.749, lon: -84.388 },
  miami: { lat: 25.7617, lon: -80.1918 },
  "new york": { lat: 40.7128, lon: -74.006 },
  boston: { lat: 42.3601, lon: -71.0589 },
  philadelphia: { lat: 39.9526, lon: -75.1652 },
  pittsburgh: { lat: 40.4406, lon: -79.9959 },
  "washington, dc": { lat: 38.9072, lon: -77.0369 },
  washington: { lat: 38.9072, lon: -77.0369 },
  nashville: { lat: 36.1627, lon: -86.7816 },
  "salt lake city": { lat: 40.7608, lon: -111.891 },
};

export function lookupCityCoords(city: string): { lat: number; lon: number } | null {
  const normalized = city.toLowerCase().trim();
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (normalized.includes(name)) return coords;
  }
  return null;
}
