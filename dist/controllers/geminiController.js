"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocationDetailsWithGemini = exports.findLocationsWithGemini = exports.ai = void 0;
const genai_1 = require("@google/genai");
const errorHandler_1 = require("../utils/errorHandler");
const googleSearch_1 = require("../utils/googleSearch");
const isSearchType = (value) => value === 'clubs' || value === 'beaches';
const GOOGLE_API_KEY = process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    '';
exports.ai = GOOGLE_API_KEY
    ? new genai_1.GoogleGenAI({ apiKey: GOOGLE_API_KEY })
    : null;
const parseTopicContext = (rawTopic) => {
    if (!rawTopic) {
        return {};
    }
    try {
        const parsed = JSON.parse(rawTopic);
        if (typeof parsed === 'object' && parsed !== null) {
            const country = typeof parsed.country === 'string' ? parsed.country.trim() : undefined;
            const city = typeof parsed.city === 'string' ? parsed.city.trim() : undefined;
            const vibe = typeof parsed.vibe === 'string' ? parsed.vibe.trim() : undefined;
            return { country, city, vibe };
        }
    }
    catch {
        // ignore parse errors; fall back to treating the topic as free text.
    }
    return {};
};
const generateSearchPrompt = (searchType, topic) => {
    const context = parseTopicContext(topic);
    const typeMap = {
        clubs: {
            description: 'swinger clubs. The results must ONLY be swinger clubs, not lifestyle-friendly bars or other venues.',
            qualifier: 'swinger clubs',
        },
        beaches: {
            description: 'official nude beaches or clothing-optional beaches. Do NOT include resorts or parks unless they are primarily known as a nude beach.',
            qualifier: 'nude beaches',
        },
    };
    const { description: searchFor, qualifier } = typeMap[searchType];
    const { country, city, vibe } = context;
    const targetDescriptor = city && country
        ? `"${city}, ${country}"`
        : country
            ? `"${country}"`
            : `"${topic}"`;
    const locationConstraint = city && country
        ? `Focus exclusively on venues located in ${city}, ${country}. Venues must be within ${city} or within a 50 kilometer radius.`
        : country
            ? `Focus exclusively on venues located within ${country}.`
            : `Use the provided topic to determine the intended country or city, and stay strictly within that geography.`;
    const vibePreference = vibe
        ? `Prioritise venues whose reputation matches the vibe "${vibe}" (without inventing details).`
        : '';
    const enforcedTopic = `${city ? `${city}, ` : ''}${country ?? topic} ${qualifier}`.trim();
    return `
You are a meticulous travel concierge for discerning swinger couples.

Task:
- Find the top 8-10 ${searchFor} specifically for ${targetDescriptor}.
- ${locationConstraint}
- If no clearly ${qualifier} venues exist for this location, return {"locations": []}. Never substitute cities or countries.
- The "location" field for each result must include the true city and country of the venue.
- Use only venues that can be corroborated by credible sources (official websites, established travel publications, lifestyle directories). Do not hallucinate venues.
${vibePreference ? `- ${vibePreference}` : ''}

Output format:
Return a single JSON object with the key "locations", whose value is an array of objects with:
  "name": venue name,
  "location": the precise city/region string,
  "description": a short, enticing blurb (max 45 words),
  "imageUrl": a direct HTTPS URL to a representative real photo. If none can be found, use a tasteful stock photo from Unsplash or Pexels that fits the venue type.

Do not include any additional keys. The JSON must be valid and parseable.
If you are unsure, return {"locations": []}.

Reference topic (enforced): ${enforcedTopic}
`;
};
const locationSchema = {
    type: genai_1.Type.OBJECT,
    properties: {
        locations: {
            type: genai_1.Type.ARRAY,
            items: {
                type: genai_1.Type.OBJECT,
                properties: {
                    name: {
                        type: genai_1.Type.STRING,
                        description: 'The name of the location.',
                    },
                    location: {
                        type: genai_1.Type.STRING,
                        description: 'The specific city, state, or region.',
                    },
                    description: {
                        type: genai_1.Type.STRING,
                        description: 'A short description highlighting why the location is noteworthy.',
                    },
                    imageUrl: {
                        type: genai_1.Type.STRING,
                        description: 'A fully qualified, publicly accessible image URL.',
                    },
                },
                required: ['name', 'location', 'description', 'imageUrl'],
            },
        },
    },
    required: ['locations'],
};
const detailSchema = {
    type: genai_1.Type.OBJECT,
    properties: {
        address: {
            type: genai_1.Type.STRING,
            description: 'The full street address of the location.',
        },
        website: {
            type: genai_1.Type.STRING,
            description: 'The official website URL. Should start with http or https.',
        },
        phone: {
            type: genai_1.Type.STRING,
            description: 'The contact phone number in a standard format.',
        },
        amenities: {
            type: genai_1.Type.ARRAY,
            items: { type: genai_1.Type.STRING },
            description: 'A list of 3-5 key amenities or features.',
        },
        atmosphere: {
            type: genai_1.Type.STRING,
            description: 'A description of the atmosphere, vibe, or typical crowd.',
        },
    },
    required: ['address', 'website', 'phone', 'amenities', 'atmosphere'],
};
const attemptGoogleFallback = async (searchType, topic, context, prefetchedResults) => {
    const googleResults = prefetchedResults ??
        (await (0, googleSearch_1.searchLifestyleWithGoogle)(searchType, context.country || topic, context.city, context.vibe));
    if (!googleResults.length) {
        return null;
    }
    return googleResults.map((entry) => ({
        name: entry.name,
        location: entry.location ||
            (context.city && context.country
                ? `${context.city}, ${context.country}`
                : context.country || entry.name),
        description: entry.description,
        imageUrl: entry.imageUrl,
    }));
};
const normalizeName = (value) => {
    if (!value)
        return '';
    return value
        .toLowerCase()
        .replace(/&amp;/g, 'and')
        .replace(/[^a-z0-9]+/g, '')
        .replace(/(club|hotel|resort|beach|lounge|the)$/g, '')
        .trim();
};
const mergeGeminiWithGoogle = (geminiLocations, googleResults, context) => {
    if (!geminiLocations.length || !googleResults.length) {
        return { verified: [], remainingGoogle: googleResults, rejected: geminiLocations };
    }
    const availableGoogle = [...googleResults];
    const verified = [];
    const rejected = [];
    geminiLocations.forEach((location) => {
        const gemName = normalizeName(location?.name);
        const gemLocation = normalizeName(location?.location ??
            (context.city && context.country
                ? `${context.city}, ${context.country}`
                : context.country ?? ''));
        let bestIndex = -1;
        let bestScore = 0;
        availableGoogle.forEach((candidate, index) => {
            const candidateName = normalizeName(candidate.name);
            const candidateLocation = normalizeName(candidate.location);
            let score = 0;
            if (candidateName && gemName) {
                if (candidateName === gemName) {
                    score += 4;
                }
                else if (candidateName.includes(gemName) ||
                    gemName.includes(candidateName)) {
                    score += 3;
                }
            }
            if (candidateLocation && gemLocation) {
                if (candidateLocation === gemLocation) {
                    score += 2;
                }
                else if (candidateLocation.includes(gemLocation) ||
                    gemLocation.includes(candidateLocation)) {
                    score += 1;
                }
            }
            if (score > bestScore && score >= 3) {
                bestScore = score;
                bestIndex = index;
            }
        });
        if (bestIndex >= 0) {
            const match = availableGoogle.splice(bestIndex, 1)[0];
            verified.push({
                name: match.name,
                location: match.location ||
                    location?.location ||
                    (context.city && context.country
                        ? `${context.city}, ${context.country}`
                        : context.country || match.name),
                description: match.description || location?.description || '',
                imageUrl: match.imageUrl || location?.imageUrl || '',
                url: match.url,
            });
        }
        else {
            rejected.push(location);
        }
    });
    return { verified, remainingGoogle: availableGoogle, rejected };
};
const findLocationsWithGemini = async (req, res, next) => {
    const requestSearchType = req.body?.searchType;
    const requestTopic = req.body?.topic;
    if (!exports.ai) {
        if (requestTopic && isSearchType(requestSearchType)) {
            const context = parseTopicContext(requestTopic);
            const fallback = await attemptGoogleFallback(requestSearchType, requestTopic, context, undefined);
            if (fallback?.length) {
                return res.status(200).json({
                    locations: fallback,
                    articles: [],
                    sources: [],
                });
            }
        }
        return next(new errorHandler_1.OperationalError('The AI service is not configured on the server. Please contact support.', 503));
    }
    if (!requestTopic || !isSearchType(requestSearchType)) {
        return next(new errorHandler_1.OperationalError('A valid searchType (clubs, beaches) and topic are required.', 400));
    }
    const searchType = requestSearchType;
    const topic = requestTopic;
    const context = parseTopicContext(topic);
    const prompt = generateSearchPrompt(searchType, topic);
    try {
        const response = await exports.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }],
                },
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: locationSchema,
                safetySettings: [
                    {
                        category: genai_1.HarmCategory.HARM_CATEGORY_HARASSMENT,
                        threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: genai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: genai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                        threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: genai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                        threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
                    },
                ],
            },
        });
        const text = response.text;
        if (!text) {
            throw new errorHandler_1.OperationalError('The AI service returned an empty response.', 500);
        }
        let parsedResponse;
        try {
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
            const jsonString = jsonMatch ? jsonMatch[1] : text;
            parsedResponse = JSON.parse(jsonString.trim());
        }
        catch (parseError) {
            console.error('Failed to parse JSON from Gemini:', text, parseError);
            throw new errorHandler_1.OperationalError('The AI service returned an invalid response format.', 500);
        }
        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
            ?.filter((chunk) => chunk?.web)
            .map((chunk) => ({
            title: chunk.web?.title ?? 'Unknown title',
            uri: chunk.web?.uri ?? '#',
        })) ?? [];
        let locations = Array.isArray(parsedResponse?.locations)
            ? parsedResponse.locations
            : [];
        let googleReference = null;
        if (locations.length) {
            googleReference = await (0, googleSearch_1.searchLifestyleWithGoogle)(searchType, context.country || topic, context.city, context.vibe);
            if (googleReference.length) {
                const { verified, remainingGoogle, rejected } = mergeGeminiWithGoogle(locations, googleReference, context);
                if (verified.length) {
                    locations = verified;
                    googleReference = remainingGoogle;
                    if (rejected.length) {
                        console.warn('[geminiController] Discarded unverified Gemini venues:', rejected.map((loc) => loc?.name).filter(Boolean));
                    }
                }
                else if (remainingGoogle.length) {
                    const fallbackLocations = await attemptGoogleFallback(searchType, topic, context, remainingGoogle);
                    if (fallbackLocations?.length) {
                        locations = fallbackLocations;
                        googleReference = null;
                    }
                }
            }
        }
        if (!locations.length) {
            if (!googleReference) {
                googleReference = await (0, googleSearch_1.searchLifestyleWithGoogle)(searchType, context.country || topic, context.city, context.vibe);
            }
            const fallbackLocations = await attemptGoogleFallback(searchType, topic, context, googleReference);
            if (fallbackLocations?.length) {
                locations = fallbackLocations;
            }
        }
        const payload = {
            locations,
            articles: Array.isArray(parsedResponse?.articles)
                ? parsedResponse.articles
                : [],
            sources,
        };
        return res.status(200).json(payload);
    }
    catch (error) {
        console.error('Error with Gemini API:', error);
        try {
            const fallbackLocations = await attemptGoogleFallback(searchType, topic, context, undefined);
            if (fallbackLocations?.length) {
                return res.status(200).json({
                    locations: fallbackLocations,
                    articles: [],
                    sources: [],
                });
            }
        }
        catch (googleError) {
            console.error('Google fallback also failed:', googleError);
        }
        const rawMessage = error?.message ?? '';
        const statusFromError = error?.status ??
            error?.statusCode ??
            error?.error?.code ??
            (typeof rawMessage === 'string' && rawMessage.includes('"code":503')
                ? 503
                : null);
        const httpStatus = typeof statusFromError === 'number' ? statusFromError : 500;
        return next(new errorHandler_1.OperationalError(rawMessage || 'Failed to get a response from the AI service.', httpStatus));
    }
};
exports.findLocationsWithGemini = findLocationsWithGemini;
const generateDetailPrompt = (name, location, searchType) => {
    const typeDescription = {
        clubs: 'swinger club',
        beaches: 'nude or clothing-optional beach',
    };
    return `
You are assisting a lifestyle concierge service.

Task:
- Provide verified practical details for the ${typeDescription[searchType]} "${name}" located in "${location}".
- If you cannot confirm the details with high confidence, return {"address":"","website":"","phone":"","amenities":[],"atmosphere":""}.
- Prefer official or well-established sources, and never fabricate contact details.

Output:
Return a single JSON object with the schema provided (address, website, phone, amenities, atmosphere). Do not include Markdown code fences.
`;
};
const getLocationDetailsWithGemini = async (req, res, next) => {
    if (!exports.ai) {
        return next(new errorHandler_1.OperationalError('The AI service is not configured on the server. Please contact support.', 503));
    }
    const { name, location, searchType } = req.body;
    if (!name || !location || !isSearchType(searchType)) {
        return next(new errorHandler_1.OperationalError('Name, location, and a valid searchType are required to fetch details.', 400));
    }
    try {
        const response = await exports.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [{ text: generateDetailPrompt(name, location, searchType) }],
                },
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: detailSchema,
                safetySettings: [
                    {
                        category: genai_1.HarmCategory.HARM_CATEGORY_HARASSMENT,
                        threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: genai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: genai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                        threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: genai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                        threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
                    },
                ],
            },
        });
        const text = response.text;
        if (!text) {
            throw new errorHandler_1.OperationalError('The AI service returned an empty response.', 500);
        }
        let parsedResponse;
        try {
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
            const jsonString = jsonMatch ? jsonMatch[1] : text;
            parsedResponse = JSON.parse(jsonString.trim());
        }
        catch (parseError) {
            console.error('Failed to parse JSON from Gemini detail response:', text, parseError);
            throw new errorHandler_1.OperationalError('The AI service returned an invalid response format.', 500);
        }
        return res.status(200).json(parsedResponse);
    }
    catch (error) {
        console.error('Error obtaining location details from Gemini:', error);
        const rawMessage = error?.message ?? '';
        const statusFromError = error?.status ??
            error?.statusCode ??
            error?.error?.code ??
            (typeof rawMessage === 'string' && rawMessage.includes('"code":503')
                ? 503
                : null);
        const httpStatus = typeof statusFromError === 'number' ? statusFromError : 500;
        return next(new errorHandler_1.OperationalError(rawMessage || 'Failed to fetch location details from the AI service.', httpStatus));
    }
};
exports.getLocationDetailsWithGemini = getLocationDetailsWithGemini;
