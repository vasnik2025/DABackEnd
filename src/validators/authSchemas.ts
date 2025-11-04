import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
  isPasswordStrong,
} from '../utils/passwordPolicy';

// We validate *after* normalizing aliases to {email,password}
export const loginSchema = z.object({
  body: z.object({
    email: z.string().min(1, 'Username or email is required').max(254),
    password: z.string().min(1, 'Password is required.'),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Username is required.'),
    email: z.string().email('Invalid email'),
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
    partnerEmail: z.string().email('Invalid partner email.'),
    coupleType: z.enum(['mf', 'mm', 'ff', 'couple', 'MF', 'MM', 'FF', 'Couple']).nullable(),
    country: z.string().min(1, 'Country is required.'),
    city: z.string().min(1, 'City is required.'),
    partner1Nickname: z.string().min(1, 'Partner 1 Nickname is required.'),
    partner2Nickname: z.string().min(1, 'Partner 2 Nickname is required.'),
  }),
});

export const resendVerificationSchema = z.object({
  body: z.object({
    primaryEmail: z.string().email('Primary email must be valid.'),
    partnerEmail: z.string().email('Partner email must be valid.'),
  }),
});
