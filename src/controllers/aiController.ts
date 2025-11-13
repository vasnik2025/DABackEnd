import type { Request, Response, NextFunction } from 'express';

type ZodiacPrediction = {
  sign: string;
  summary: string;
  mood: string;
  luckyNumber: number;
  ritual: string;
  compatibleSigns: string[];
  agentName: string;
  timestamp: string;
};

type Trait = {
  element: string;
  focus: string;
  keywords: string[];
  compatible: string[];
};

const ZODIAC_TRAITS: Record<string, Trait> = {
  aries: { element: 'Fire', focus: 'impulse calibration', keywords: ['bold', 'spontaneous', 'undaunted'], compatible: ['Leo', 'Sagittarius', 'Gemini'] },
  taurus: { element: 'Earth', focus: 'pleasure logistics', keywords: ['grounded', 'sensual', 'patient'], compatible: ['Virgo', 'Capricorn', 'Cancer'] },
  gemini: { element: 'Air', focus: 'signal clarity', keywords: ['curious', 'witty', 'adaptive'], compatible: ['Libra', 'Aquarius', 'Aries'] },
  cancer: { element: 'Water', focus: 'emotional tide work', keywords: ['intuitive', 'protective', 'nurturing'], compatible: ['Scorpio', 'Pisces', 'Taurus'] },
  leo: { element: 'Fire', focus: 'spotlight hygiene', keywords: ['radiant', 'generous', 'dramatic'], compatible: ['Aries', 'Sagittarius', 'Libra'] },
  virgo: { element: 'Earth', focus: 'precision play', keywords: ['discerning', 'devoted', 'methodical'], compatible: ['Taurus', 'Capricorn', 'Cancer'] },
  libra: { element: 'Air', focus: 'harmony audits', keywords: ['diplomatic', 'romantic', 'balanced'], compatible: ['Gemini', 'Aquarius', 'Leo'] },
  scorpio: { element: 'Water', focus: 'trust alchemy', keywords: ['magnetic', 'intense', 'strategic'], compatible: ['Cancer', 'Pisces', 'Virgo'] },
  sagittarius: { element: 'Fire', focus: 'truth roaming', keywords: ['candid', 'expansive', 'philosophical'], compatible: ['Aries', 'Leo', 'Aquarius'] },
  capricorn: { element: 'Earth', focus: 'ambition pacing', keywords: ['resilient', 'disciplined', 'patient'], compatible: ['Taurus', 'Virgo', 'Pisces'] },
  aquarius: { element: 'Air', focus: 'rebel circuitry', keywords: ['innovative', 'aloof', 'visionary'], compatible: ['Gemini', 'Libra', 'Sagittarius'] },
  pisces: { element: 'Water', focus: 'dream curation', keywords: ['empathetic', 'mythic', 'fluid'], compatible: ['Cancer', 'Scorpio', 'Capricorn'] },
  default: { element: 'Cosmic', focus: 'fresh alignment', keywords: ['open', 'curious', 'luminous'], compatible: ['Libra', 'Sagittarius', 'Pisces'] },
};

const AI_AGENT_HANDLES = ['Aurora-9', 'Heliosynth', 'Nebula Sage', 'Quantum Muse', 'Oracle Drift', 'Celestine', 'VibePilot', 'Starlace'];
const COSMIC_RITUALS = [
  'Take five minutes to breathe in your {focus} and jot one bold intention.',
  'Ping someone who mirrors your {focus} and amplify that thread.',
  'Move your body with a micro-dance so {focus} can settle in.',
  'Choose a talisman that reminds you of {focus} and keep it close today.',
  'Refactor one to-do into a desire—let {focus} guide the language.',
];

const hashString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(i);
  }
  return Math.abs(hash);
};

const formatZodiacLabel = (sign: string): string => {
  if (!sign) return 'Your Sign';
  return sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();
};

const pickFromList = <T,>(list: T[], seed: number): T => list[Math.abs(seed) % list.length];

const buildLocalZodiacPrediction = (rawSign: string): ZodiacPrediction => {
  const normalized = rawSign?.trim().toLowerCase() || 'default';
  const trait = ZODIAC_TRAITS[normalized] ?? ZODIAC_TRAITS.default;
  const todayKey = `${normalized}-${new Date().toISOString().slice(0, 10)}`;
  const seed = hashString(todayKey);
  const tone = pickFromList(trait.keywords, seed + 17);
  const summary = `Your ${trait.element.toLowerCase()} field hums with ${tone} charge. Lean into ${trait.focus} and let serendipity meet you halfway.`;

  return {
    sign: formatZodiacLabel(normalized),
    summary,
    mood: trait.focus,
    luckyNumber: (seed % 77) + 3,
    ritual: pickFromList(COSMIC_RITUALS, seed + 7).replace('{focus}', trait.focus),
    compatibleSigns: trait.compatible.length ? trait.compatible : ZODIAC_TRAITS.default.compatible,
    agentName: pickFromList(AI_AGENT_HANDLES, seed + 3),
    timestamp: new Date().toISOString(),
  };
};

export async function handleGetZodiacPrediction(req: Request, res: Response, next: NextFunction) {
  try {
    const signParam = typeof req.query?.sign === 'string' ? req.query.sign.trim() : '';
    const normalized = signParam.length ? signParam : 'default';
    const prediction = buildLocalZodiacPrediction(normalized);
    res.status(200).json(prediction);
  } catch (error) {
    next(error as Error);
  }
}
