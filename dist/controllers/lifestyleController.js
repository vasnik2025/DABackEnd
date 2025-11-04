"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findLifestyleLocations = void 0;
const errorHandler_1 = require("../utils/errorHandler");
const googleSearch_1 = require("../utils/googleSearch");
const isSearchType = (value) => value === "clubs" || value === "beaches";
const parseTopicContext = (rawTopic) => {
    if (!rawTopic)
        return {};
    try {
        const parsed = JSON.parse(rawTopic);
        if (typeof parsed === "object" && parsed !== null) {
            const country = typeof parsed.country === "string" ? parsed.country.trim() : undefined;
            const city = typeof parsed.city === "string" ? parsed.city.trim() : undefined;
            const vibe = typeof parsed.vibe === "string" ? parsed.vibe.trim() : undefined;
            const countryCode = typeof parsed.countryCode === "string" ? parsed.countryCode.trim() : undefined;
            return { country, city, vibe, countryCode };
        }
    }
    catch (error) {
        console.warn("[lifestyleController] Failed to parse topic context:", error);
    }
    return {};
};
const findLifestyleLocations = async (req, res, next) => {
    const requestSearchType = req.body?.searchType;
    const requestTopic = req.body?.topic;
    if (!requestTopic || !isSearchType(requestSearchType)) {
        return next(new errorHandler_1.OperationalError("A valid searchType (clubs, beaches) and topic are required.", 400));
    }
    const searchType = requestSearchType;
    const topic = requestTopic;
    const context = parseTopicContext(topic);
    try {
        const { results, searchUrl } = await (0, googleSearch_1.searchLifestyleWithGoogle)(searchType, context.country || topic, context.city, context.vibe, context.countryCode);
        const fallbackLocation = context.city && context.country
            ? `${context.city}, ${context.country}`
            : context.country || "";
        const locations = results.length > 0
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
                    name: `${searchType.charAt(0).toUpperCase()}${searchType.slice(1)} search`.trim(),
                    location: fallbackLocation || "Worldwide",
                    description: "Follow this Google search to explore the latest lifestyle venues that match your vibe.",
                    imageUrl: "",
                    mapUrl: searchUrl,
                },
            ];
        const sources = [
            ...results
                .map((entry) => {
                const uri = entry.websiteUrl || entry.mapUrl;
                if (!uri)
                    return null;
                return {
                    title: entry.name,
                    uri,
                };
            })
                .filter((item) => Boolean(item)),
            {
                title: "Open full Google search",
                uri: searchUrl,
            },
        ];
        return res.status(200).json({
            locations,
            articles: [],
            sources,
        });
    }
    catch (error) {
        console.error("[lifestyleController] Google search failed:", error);
        return next(new errorHandler_1.OperationalError(error?.message || "Failed to fetch lifestyle locations.", 500));
    }
};
exports.findLifestyleLocations = findLifestyleLocations;
