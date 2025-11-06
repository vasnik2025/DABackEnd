"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resendVerificationSchema = exports.registerSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
const passwordPolicy_1 = require("../utils/passwordPolicy");
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
];
// We validate *after* normalizing aliases to {email,password}
exports.loginSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().min(1, 'Username or email is required').max(254),
        password: zod_1.z.string().min(1, 'Password is required.'),
    }),
});
exports.registerSchema = zod_1.z.object({
    body: zod_1.z.object({
        accountType: zod_1.z.enum(['single', 'couple']).default('single'),
        username: zod_1.z.string().min(1, 'Username is required.'),
        email: zod_1.z.string().email('Invalid email'),
        zodiacSign: zod_1.z.enum(ZODIAC_SIGNS, { errorMap: () => ({ message: 'Please choose your zodiac sign.' }) }),
        password: zod_1.z
            .string()
            .min(passwordPolicy_1.PASSWORD_MIN_LENGTH, `Password must be at least ${passwordPolicy_1.PASSWORD_MIN_LENGTH} characters.`)
            .superRefine((value, ctx) => {
            if (!(0, passwordPolicy_1.isPasswordStrong)(value)) {
                ctx.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    message: passwordPolicy_1.PASSWORD_REQUIREMENTS_MESSAGE,
                });
            }
        }),
        partnerEmail: zod_1.z.string().email('Invalid partner email.').optional().nullable(),
        coupleType: zod_1.z.enum(['mf', 'mm', 'ff', 'couple', 'MF', 'MM', 'FF', 'Couple']).nullable().optional(),
        country: zod_1.z.string().min(1, 'Country is required.'),
        city: zod_1.z.string().min(1, 'City is required.'),
        partner1Nickname: zod_1.z.string().min(1, 'Partner 1 Nickname is required.'),
        partner2Nickname: zod_1.z.string().min(1, 'Partner 2 Nickname is required.').optional().nullable(),
    }).superRefine((data, ctx) => {
        if (data.accountType === 'couple') {
            if (!data.partnerEmail) {
                ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['partnerEmail'], message: 'Partner email is required for couple accounts.' });
            }
            if (!data.partner2Nickname) {
                ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['partner2Nickname'], message: 'Partner 2 nickname is required for couple accounts.' });
            }
            if (!data.coupleType) {
                ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['coupleType'], message: 'Couple type is required.' });
            }
        }
    }),
});
exports.resendVerificationSchema = zod_1.z.object({
    body: zod_1.z.object({
        primaryEmail: zod_1.z.string().email('Primary email must be valid.'),
        partnerEmail: zod_1.z.string().email('Partner email must be valid.'),
    }),
});
