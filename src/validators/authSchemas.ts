import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
  isPasswordStrong,
} from '../utils/passwordPolicy';

const ZODIAC_SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
] as const;

// We validate *after* normalizing aliases to {email,password}
export const loginSchema = z.object({
  body: z.object({
    email: z.string().min(1, 'Username or email is required').max(254),
    password: z.string().min(1, 'Password is required.'),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    accountType: z.enum(['single', 'couple']).default('single'),
    username: z.string().min(1, 'Username is required.'),
    email: z.string().email('Invalid email'),
    zodiacSign: z.enum(ZODIAC_SIGNS, { errorMap: () => ({ message: 'Please choose your zodiac sign.' }) }),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .superRefine((value, ctx) => {
        if (!isPasswordStrong(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: PASSWORD_REQUIREMENTS_MESSAGE,
          });
        }
      }),
    partnerEmail: z.string().email('Invalid partner email.').optional().nullable(),
    coupleType: z.enum(['mf', 'mm', 'ff', 'couple', 'MF', 'MM', 'FF', 'Couple']).nullable().optional(),
    country: z.string().min(1, 'Country is required.'),
    city: z.string().min(1, 'City is required.'),
    partner1Nickname: z.string().min(1, 'Partner 1 Nickname is required.'),
    partner2Nickname: z.string().min(1, 'Partner 2 Nickname is required.').optional().nullable(),
  }).superRefine((data, ctx) => {
    if (data.accountType === 'couple') {
      if (!data.partnerEmail) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['partnerEmail'], message: 'Partner email is required for couple accounts.' });
      }
      if (!data.partner2Nickname) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['partner2Nickname'], message: 'Partner 2 nickname is required for couple accounts.' });
      }
      if (!data.coupleType) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['coupleType'], message: 'Couple type is required.' });
      }
    }
  }),
});

export const resendVerificationSchema = z.object({
  body: z.object({
    primaryEmail: z.string().email('Primary email must be valid.'),
    partnerEmail: z.string().email('Partner email must be valid.'),
  }),
});
