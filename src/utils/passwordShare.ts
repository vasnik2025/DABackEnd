import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import sql from 'mssql';
import { OperationalError } from './errorHandler';

const TABLE_NAME = 'PasswordShareTokens';
const EXPIRATION_MINUTES = Number(process.env.PASSWORD_SHARE_EXPIRATION_MINUTES ?? 60);

const SECRET_SOURCE = process.env.PASSWORD_SHARE_SECRET || process.env.JWT_SECRET;

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended
const AUTH_TAG_LENGTH = 16;

const getEncryptionKey = (): Buffer => {
  if (!SECRET_SOURCE) {
    throw new OperationalError('PASSWORD_SHARE_SECRET (or JWT_SECRET) must be configured for password sharing.', 500);
  }

  return createHash('sha256').update(SECRET_SOURCE).digest();
};

export const ensurePasswordShareTable = async (pool: sql.ConnectionPool): Promise<void> => {
  await pool
    .request()
    .batch(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = '${TABLE_NAME}')
      BEGIN
        CREATE TABLE dbo.${TABLE_NAME} (
          TokenID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
          UserID VARCHAR(255) NOT NULL,
          PartnerEmail NVARCHAR(255) NOT NULL,
          EncryptedPayload NVARCHAR(MAX) NOT NULL,
          ExpiresAt DATETIME2 NOT NULL,
          UsedAt DATETIME2 NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );

        CREATE INDEX IX_${TABLE_NAME}_User ON dbo.${TABLE_NAME} (UserID);
      END
    `);
};

export const encryptPasswordForShare = (password: string): string => {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};

export const decryptPasswordFromShare = (payload: string): string => {
  const key = getEncryptionKey();
  const buffer = Buffer.from(payload, 'base64');

  if (buffer.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new OperationalError('Invalid password share payload.', 400);
  }

  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};

export type PasswordShareRecord = {
  tokenId: string;
  userId: string;
  partnerEmail: string;
  encryptedPayload: string;
  expiresAt: Date;
  usedAt?: Date | null;
};

export const insertPasswordShareRecord = async (
  pool: sql.ConnectionPool,
  params: { userId: string; partnerEmail: string; password: string },
): Promise<{ token: string; expiresAt: Date }> => {
  await ensurePasswordShareTable(pool);

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + EXPIRATION_MINUTES * 60 * 1000);
  const encryptedPayload = encryptPasswordForShare(params.password);

  await pool
    .request()
    .input('TokenID', sql.UniqueIdentifier, token)
    .input('UserID', sql.VarChar(255), params.userId)
    .input('PartnerEmail', sql.NVarChar(255), params.partnerEmail)
    .input('EncryptedPayload', sql.NVarChar(sql.MAX), encryptedPayload)
    .input('ExpiresAt', sql.DateTime2, expiresAt)
    .query(`
      INSERT INTO dbo.${TABLE_NAME} (TokenID, UserID, PartnerEmail, EncryptedPayload, ExpiresAt)
      VALUES (@TokenID, @UserID, @PartnerEmail, @EncryptedPayload, @ExpiresAt);
    `);

  return { token, expiresAt };
};

export const getPasswordShareRecord = async (
  pool: sql.ConnectionPool,
  token: string,
): Promise<PasswordShareRecord | null> => {
  await ensurePasswordShareTable(pool);

  const result = await pool
    .request()
    .input('TokenID', sql.UniqueIdentifier, token)
    .query(`
      SELECT TokenID, UserID, PartnerEmail, EncryptedPayload, ExpiresAt, UsedAt
      FROM dbo.${TABLE_NAME}
      WHERE TokenID = @TokenID;
    `);

  if (!result.recordset?.length) {
    return null;
  }

  const row = result.recordset[0] as any;
  return {
    tokenId: row.TokenID,
    userId: row.UserID,
    partnerEmail: row.PartnerEmail,
    encryptedPayload: row.EncryptedPayload,
    expiresAt: row.ExpiresAt,
    usedAt: row.UsedAt,
  };
};

export const markPasswordShareUsed = async (pool: sql.ConnectionPool, token: string): Promise<void> => {
  await pool
    .request()
    .input('TokenID', sql.UniqueIdentifier, token)
    .query(`
      UPDATE dbo.${TABLE_NAME}
      SET UsedAt = SYSUTCDATETIME()
      WHERE TokenID = @TokenID;
    `);
};
