type SearchType = "clubs" | "beaches";

const TEXT_SEARCH_ENDPOINT =
  "https://maps.googleapis.com/maps/api/place/textsearch/json";
const DETAILS_ENDPOINT =
  "https://maps.googleapis.com/maps/api/place/details/json";

const MAX_RESULTS = 8;
const DETAIL_FIELDS = [
  "website",
  "url",
  "international_phone_number",
  "formatted_phone_number",
].join(",");

const GENERIC_TYPES = new Set([
  "point of interest",
  "establishment",
  "store",
  "premise",
  "tourist attraction",
  "food",
]);

const TYPE_LABEL_OVERRIDES: Record<string, string> = {
  night_club: "Night club",
  bar: "Bar",
  spa: "Spa",
  lodging: "Lodging",
  restaurant: "Restaurant",
  gym: "Fitness club",
  movie_theater: "Movie theater",
  art_gallery: "Art gallery",
};

const PRICE_LABELS: Record<number, string> = {
  0: "Free",
  1: "Budget-friendly",
  2: "Moderate",
  3: "Upscale",
  4: "Luxury",
};

const cleanText = (value?: string | null): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const toTitleCase = (input: string): string =>
  input
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const formatTypes = (types?: string[] | null): string[] => {
  if (!Array.isArray(types)) {
    return [];
  }

  const labels = types
    .map((type) => TYPE_LABEL_OVERRIDES[type] ?? toTitleCase(type.replace(/_/g, " ")))
    .map((label) => label.trim())
    .filter((label) => label.length > 0 && !GENERIC_TYPES.has(label.toLowerCase()));

  return Array.from(new Set(labels));
};

const formatDescription = (place: any, formattedTypes: string[]): string => {
  const highlights: string[] = [];

  if (typeof place.rating === "number") {
    const ratingNumber = place.rating.toFixed(1);
    const ratingText =
      place.user_ratings_total && place.user_ratings_total > 0
        ? ratingNumber + "/5 rating from " + place.user_ratings_total + " reviews"
        : ratingNumber + "/5 rating";
    highlights.push(ratingText);
  }

  if (typeof place.price_level === "number" && PRICE_LABELS[place.price_level]) {
    highlights.push(PRICE_LABELS[place.price_level]);
  }

  if (place.opening_hours?.open_now !== undefined) {
    highlights.push(place.opening_hours.open_now ? "Open now" : "Currently closed");
  }

  if (formattedTypes.length) {
    highlights.push(formattedTypes.slice(0, 3).join(", "));
  }

  if (
    typeof place.business_status === "string" &&
    place.business_status.length &&
    place.business_status !== "OPERATIONAL"
  ) {
    highlights.push(
      toTitleCase(place.business_status.replace(/_/g, " ").toLowerCase()),
    );
  }

  return highlights.length
    ? highlights.join(" | ")
    : "Tap to explore the latest details via Google Maps.";
};const fetchPlaceDetails = async (placeId: string, apiKey: string) => {
  const detailsUrl = new URL(DETAILS_ENDPOINT);
  detailsUrl.searchParams.set("place_id", placeId);
  detailsUrl.searchParams.set("fields", DETAIL_FIELDS);
  detailsUrl.searchParams.set("language", "en");
  detailsUrl.searchParams.set("key", apiKey);

  try {
    const response = await fetch(detailsUrl.toString());
    const payload = await response.json();
    if (payload.status !== "OK") {
      return null;
    }
    return payload.result ?? null;
  } catch (error) {
    console.warn("[googleSearch] Failed to fetch place details:", error);
    return null;
  }
};

export interface GoogleLocationResult {
  name: string;
  location: string;
  description: string;
  imageUrl: string;
  mapUrl?: string;
  websiteUrl?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  phoneNumber?: string;
}

export interface GoogleLifestyleSearchResponse {
  results: GoogleLocationResult[];
  query: string;
  searchUrl: string;
  warning?: string;
}

const SEARCH_PHRASES: Record<SearchType, string> = {
  clubs: "swingers club in ",
  beaches: "nude beaches and nude campings in ",
};

const buildBaseQuery = (
  searchType: SearchType,
  country: string,
  city?: string | null,
  _vibe?: string | null,
  countryCode?: string | null,
): { query: string; locationLabel: string; regionCode?: string } => {
  const cleanedCountry = cleanText(country);
  const cleanedCity = cleanText(city);
  const cleanedCountryCode = cleanText(countryCode).toLowerCase() || undefined;

  const phrase = SEARCH_PHRASES[searchType] ?? "";
  const query = phrase + cleanedCountry;

  const locationLabel =
    cleanedCity && cleanedCountry
      ? `${cleanedCity}, ${cleanedCountry}`
      : cleanedCountry || cleanedCity || "";

  return { query: cleanText(query), locationLabel, regionCode: cleanedCountryCode };
};

export const searchLifestyleWithGoogle = async (
  searchType: SearchType,
  country: string,
  city?: string | null,
  vibe?: string | null,
  countryCode?: string | null,
): Promise<GoogleLifestyleSearchResponse> => {
  const apiKey =
    process.env.GOOGLE_PLACES_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error("Google Places API key is not configured.");
  }

  const { query, locationLabel, regionCode } = buildBaseQuery(
    searchType,
    country,
    city,
    vibe,
    countryCode,
  );
  const trimmedQuery = query.trim();
  const emptyResponse: GoogleLifestyleSearchResponse = {
    results: [],
    query,
    searchUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  };

  if (!trimmedQuery) {
    return emptyResponse;
  }

  const textSearchUrl = new URL(TEXT_SEARCH_ENDPOINT);
  textSearchUrl.searchParams.set("key", apiKey);
  textSearchUrl.searchParams.set("query", query);
  textSearchUrl.searchParams.set("language", "en");
  if (regionCode && regionCode.length === 2) {
    textSearchUrl.searchParams.set("region", regionCode);
  }

  const response = await fetch(textSearchUrl.toString());
  const payload = await response.json();

  if (payload.status === "ZERO_RESULTS") {
    return emptyResponse;
  }

  if (payload.status === "REQUEST_DENIED") {
    const denialMessage =
      typeof payload.error_message === "string" ? payload.error_message : "No reason provided";
    console.warn(
      `[googleSearch] Places API request denied: ${denialMessage}. Falling back to generic Google search.`,
    );
    return {
      ...emptyResponse,
      warning: denialMessage,
    };
  }

  if (payload.status !== "OK") {
    throw new Error(
      `Google Places error: ${payload.status}${
        payload.error_message ? ` - ${payload.error_message}` : ""
      }`,
    );
  }

  const places = Array.isArray(payload.results)
    ? payload.results.slice(0, MAX_RESULTS)
    : [];

  const enriched = await Promise.all(
    places.map(async (place: any) => {
      if (!place || !place.name) {
        return null;
      }

      const formattedTypes = formatTypes(place.types);
      const description = formatDescription(place, formattedTypes);
      const details = place.place_id
        ? await fetchPlaceDetails(place.place_id, apiKey)
        : null;

      const mapUrl =
        details?.url ||
        (place.place_id
          ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              place.name,
            )}`);

      return {
        name: place.name,
        location:
          place.formatted_address ||
          place.vicinity ||
          locationLabel ||
          "Location provided by Google Maps",
        description,
        imageUrl: "",
        mapUrl,
        websiteUrl: details?.website,
        rating: typeof place.rating === "number" ? place.rating : undefined,
        reviewCount:
          typeof place.user_ratings_total === "number"
            ? place.user_ratings_total
            : undefined,
        priceLevel:
          typeof place.price_level === "number" ? place.price_level : undefined,
        phoneNumber:
          details?.international_phone_number ??
          details?.formatted_phone_number ??
          undefined,
      } as GoogleLocationResult;
    }),
  );

  const results = enriched.filter(
    (entry): entry is GoogleLocationResult => Boolean(entry?.name),
  );

  return {
    results,
    query,
    searchUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  };
};

