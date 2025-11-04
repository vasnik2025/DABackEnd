import type { Request, Response, NextFunction } from 'express';
import { OperationalError } from '../utils/errorHandler';

const resolveEnv = (primary: string, fallbacks: string[] = []): string => {
  const keys = [primary, ...fallbacks];
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

export const getPaypalClientId = (req: Request, res: Response, next: NextFunction) => {
  const clientId = resolveEnv('PAYPAL_CLIENT_ID', [
    'PAYPAL_CLIENTID',
    'PAYPAL_REST_CLIENT_ID',
    'PAYPAL_LIVE_CLIENT_ID',
    'PAYPAL_SANDBOX_CLIENT_ID',
  ]);

  if (!clientId) {
    console.error('[PayPal] Client ID is not configured in environment variables.');
    return next(
      new OperationalError(
        'Payment service is not configured correctly. Please contact support.',
        503,
      ),
    );
  }

  res.status(200).json({ clientId });
};
