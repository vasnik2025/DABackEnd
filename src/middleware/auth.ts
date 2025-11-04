// FIX: Changed type-only import to standard import to fix type resolution.
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type Authed = { id: string; country?: string | null };
export type AuthedRequest = Request & { user?: Authed };

const COOKIE_NAME = 'sua';

export function readUser(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
        if (decoded?.id) {
          const { country = null } = decoded;
          req.user = { id: String(decoded.id), country };
        }
    }
  } catch { /* ignore invalid tokens */ }
  next();
}
