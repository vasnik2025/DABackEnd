"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markPasswordShareUsed = exports.getPasswordShareRecord = exports.insertPasswordShareRecord = exports.decryptPasswordFromShare = exports.encryptPasswordForShare = exports.ensurePasswordShareTable = void 0;
const crypto_1 = require("crypto");
const mssql_1 = __importDefault(require("mssql"));
const errorHandler_1 = require("./errorHandler");
const TABLE_NAME = 'PasswordShareTokens';
const EXPIRATION_MINUTES = Number(process.env.PASSWORD_SHARE_EXPIRATION_MINUTES ?? 60);
const SECRET_SOURCE = process.env.PASSWORD_SHARE_SECRET || process.env.JWT_SECRET;
const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended
const AUTH_TAG_LENGTH = 16;
const getEncryptionKey = () => {
    if (!SECRET_SOURCE) {
        throw new errorHandler_1.OperationalError('PASSWORD_SHARE_SECRET (or JWT_SECRET) must be configured for password sharing.', 500);
    }
    return (0, crypto_1.createHash)('sha256').update(SECRET_SOURCE).digest();
};
const ensurePasswordShareTable = async (pool) => {
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
exports.ensurePasswordShareTable = ensurePasswordShareTable;
const encryptPasswordForShare = (password) => {
    const key = getEncryptionKey();
    const iv = (0, crypto_1.randomBytes)(IV_LENGTH);
    const cipher = (0, crypto_1.createCipheriv)(AES_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};
exports.encryptPasswordForShare = encryptPasswordForShare;
const decryptPasswordFromShare = (payload) => {
    const key = getEncryptionKey();
    const buffer = Buffer.from(payload, 'base64');
    if (buffer.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new errorHandler_1.OperationalError('Invalid password share payload.', 400);
    }
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = (0, crypto_1.createDecipheriv)(AES_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
};
exports.decryptPasswordFromShare = decryptPasswordFromShare;
const insertPasswordShareRecord = async (pool, params) => {
    await (0, exports.ensurePasswordShareTable)(pool);
    const token = (0, crypto_1.randomUUID)();
    const expiresAt = new Date(Date.now() + EXPIRATION_MINUTES * 60 * 1000);
    const encryptedPayload = (0, exports.encryptPasswordForShare)(params.password);
    await pool
        .request()
        .input('TokenID', mssql_1.default.UniqueIdentifier, token)
        .input('UserID', mssql_1.default.VarChar(255), params.userId)
        .input('PartnerEmail', mssql_1.default.NVarChar(255), params.partnerEmail)
        .input('EncryptedPayload', mssql_1.default.NVarChar(mssql_1.default.MAX), encryptedPayload)
        .input('ExpiresAt', mssql_1.default.DateTime2, expiresAt)
        .query(`
      INSERT INTO dbo.${TABLE_NAME} (TokenID, UserID, PartnerEmail, EncryptedPayload, ExpiresAt)
      VALUES (@TokenID, @UserID, @PartnerEmail, @EncryptedPayload, @ExpiresAt);
    `);
    return { token, expiresAt };
};
exports.insertPasswordShareRecord = insertPasswordShareRecord;
const getPasswordShareRecord = async (pool, token) => {
    await (0, exports.ensurePasswordShareTable)(pool);
    const result = await pool
        .request()
        .input('TokenID', mssql_1.default.UniqueIdentifier, token)
        .query(`
      SELECT TokenID, UserID, PartnerEmail, EncryptedPayload, ExpiresAt, UsedAt
      FROM dbo.${TABLE_NAME}
      WHERE TokenID = @TokenID;
    `);
    if (!result.recordset?.length) {
        return null;
    }
    const row = result.recordset[0];
    return {
        tokenId: row.TokenID,
        userId: row.UserID,
        partnerEmail: row.PartnerEmail,
        encryptedPayload: row.EncryptedPayload,
        expiresAt: row.ExpiresAt,
        usedAt: row.UsedAt,
    };
};
exports.getPasswordShareRecord = getPasswordShareRecord;
const markPasswordShareUsed = async (pool, token) => {
    await pool
        .request()
        .input('TokenID', mssql_1.default.UniqueIdentifier, token)
        .query(`
      UPDATE dbo.${TABLE_NAME}
      SET UsedAt = SYSUTCDATETIME()
      WHERE TokenID = @TokenID;
    `);
};
exports.markPasswordShareUsed = markPasswordShareUsed;
