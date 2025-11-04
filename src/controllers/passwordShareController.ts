import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../config/db';
import { OperationalError } from '../utils/errorHandler';
import { decryptPasswordFromShare, getPasswordShareRecord, markPasswordShareUsed } from '../utils/passwordShare';

const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const viewPasswordShare = async (req: Request, res: Response, next: NextFunction) => {
  const { token } = req.params;

  if (!token || !GUID_REGEX.test(token)) {
    return next(new OperationalError('Invalid or missing token.', 400));
  }

  try {
    const pool = await getPool();

    const record = await getPasswordShareRecord(pool, token);
    if (!record) {
      return next(new OperationalError('This link is no longer available.', 404));
    }

    if (record.usedAt) {
      return next(new OperationalError('This password has already been viewed.', 410));
    }

    const expiresAt = new Date(record.expiresAt);
    if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      await markPasswordShareUsed(pool, token);
      return next(new OperationalError('This password link has expired.', 410));
    }

    const password = decryptPasswordFromShare(record.encryptedPayload);
    await markPasswordShareUsed(pool, token);

    res.status(200).json({ password });
  } catch (error) {
    next(error as Error);
  }
};
