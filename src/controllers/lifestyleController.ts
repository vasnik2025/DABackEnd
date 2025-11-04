import type { Request, Response, NextFunction } from "express";
import { OperationalError } from "../utils/errorHandler";
import { searchLifestyleWithGoogle } from "../utils/googleSearch";

type SearchType = "clubs" | "beaches";

const isSearchType = (value: unknown): value is SearchType =>
  value === "clubs" || value === "beaches";

const parseTopicContext = (
  rawTopic: string,
): { country?: string; city?: string; vibe?: string; countryCode?: string } => {
  if (!rawTopic) return {};
  try {
    const parsed = JSON.parse(rawTopic);
    if (typeof parsed === "object" && parsed !== null) {
      const country =
        typeof parsed.country === "string" ? parsed.country.trim() : undefined;
      const city = typeof parsed.city === "string" ? parsed.city.trim() : undefined;
      const vibe = typeof parsed.vibe === "string" ? parsed.vibe.trim() : undefined;
      const countryCode =
        typeof parsed.countryCode === "string" ? parsed.countryCode.trim() : undefined;
      return { country, city, vibe, countryCode };
    }
  } catch (error) {
    console.warn("[lifestyleController] Failed to parse topic context:", error);
  }
  return {};
};

export const findLifestyleLocations = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const requestSearchType = req.body?.searchType;
  const requestTopic = req.body?.topic;

  if (!requestTopic || !isSearchType(requestSearchType)) {
    return next(
      new OperationalError(
        "A valid searchType (clubs, beaches) and topic are required.",
        400,
      ),
    );
  }

  const searchType = requestSearchType;
  const topic = requestTopic;
  const context = parseTopicContext(topic);

  try {
    const { results, searchUrl } = await searchLifestyleWithGoogle(
      searchType,
      context.country || topic,
      context.city,
      context.vibe,
      context.countryCode,
    );

    const fallbackLocation =
      context.city && context.country
        ? `${context.city}, ${context.country}`
        : context.country || "";

    const locations =
      results.length > 0
        ? results.map((entry) => ({
            name: entry.name,
            location: entry.location || fallbackLocation || entry.name,
            description: entry.description,
            imageUrl: entry.imageUrl,
            mapUrl: entry.mapUrl,
            websiteUrl: entry.websiteUrl,
            rating: entry.rating,
            reviewCount: entry.reviewCount,
            priceLevel: entry.priceLevel,
            phoneNumber: entry.phoneNumber,
          }))
        : [
            {
              name:
                `${searchType.charAt(0).toUpperCase()}${searchType.slice(1)} search`.trim(),
              location: fallbackLocation || "Worldwide",
              description:
                "Follow this Google search to explore the latest lifestyle venues that match your vibe.",
              imageUrl: "",
              mapUrl: searchUrl,
            },
          ];

    const sources = [
      ...results
        .map((entry) => {
          const uri = entry.websiteUrl || entry.mapUrl;
          if (!uri) return null;
          return {
            title: entry.name,
            uri,
          };
        })
        .filter((item): item is { title: string; uri: string } => Boolean(item)),
      {
        title: "Open full Google search",
        uri: searchUrl,
      },
    ];

    return res.status(200).json({
      locations,
      articles: [] as never[],
      sources,
    });
  } catch (error: any) {
    console.error("[lifestyleController] Google search failed:", error);
    return next(
      new OperationalError(
        error?.message || "Failed to fetch lifestyle locations.",
        500,
      ),
    );
  }
};
