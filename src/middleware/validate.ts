import { z } from 'zod';
// FIX: Changed type-only import to standard import to fix type resolution.
import type { Request, Response, NextFunction } from 'express';

export const validate = (schema: z.ZodObject<any>) => (req: Request, res: Response, next: NextFunction) => {
  try {
    schema.parse({ body: req.body, query: req.query, params: req.params });
    next();
  } catch (err: any) {
    return res.status(400).json({ message: 'Validation error', issues: err?.issues || [] });
  }
};