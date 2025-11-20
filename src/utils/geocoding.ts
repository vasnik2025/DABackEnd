const GEOCODING_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

const resolveGeocodingApiKey = (): string | null => {
  return (
    process.env.GOOGLE_GEOCODING_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_PLACES_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    null
  );
};

export type GeocodingResult = {
  latitude: number;
  longitude: number;
};

export async function geocodeCityCountry(
  city?: string | null,
  country?: string | null,
): Promise<GeocodingResult | null> {
  const parts = [city, country]
    .map((segment) => (typeof segment === 'string' ? segment.trim() : ''))
    .filter((segment) => segment.length > 0);

  if (!parts.length) return null;

  const apiKey = resolveGeocodingApiKey();
  if (!apiKey) {
    console.warn('[geocoding] Missing GOOGLE_* API key; skipping geocode.');
    return null;
  }

  try {
    const url = new URL(GEOCODING_ENDPOINT);
    url.searchParams.set('address', parts.join(', '));
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.warn('[geocoding] Geocode request failed', response.status, response.statusText);
      return null;
    }

    const payload = await response.json();
    const location = payload?.results?.[0]?.geometry?.location;
    if (typeof location?.lat === 'number' && typeof location?.lng === 'number') {
      return {
        latitude: Number(location.lat.toFixed(6)),
        longitude: Number(location.lng.toFixed(6)),
      };
    }
  } catch (error) {
    console.error('[geocoding] Failed to resolve coordinates', error);
  }

  return null;
}
