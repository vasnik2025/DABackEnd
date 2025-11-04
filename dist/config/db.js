"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sql = void 0;
exports.getPool = getPool;
exports.withSqlRetry = withSqlRetry;
const mssql_1 = __importDefault(require("mssql"));
exports.sql = mssql_1.default;
const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 200;
let poolPromise = null;
const TRANSIENT_ERROR_CODES = new Set(['ESOCKET', 'ECONNRESET', 'ETIMEOUT']);
const TRANSIENT_ERROR_MESSAGES = ['connection lost', 'write econnreset', 'timeout'];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function isTransientError(error) {
    const err = error;
    if (!err)
        return false;
    const code = (err.code ?? '').toUpperCase();
    if (code && TRANSIENT_ERROR_CODES.has(code)) {
        return true;
    }
    const message = (err.message ?? '').toLowerCase();
    return TRANSIENT_ERROR_MESSAGES.some((fragment) => message.includes(fragment));
}
function getAzureSqlConnectionString() {
    const fromCustom = process.env.AZURE_SQL_CONNECTIONSTRING;
    const fromSqlNamed = process.env.SQLCONNSTR_DateAstrum;
    const fromCustomNamed = process.env.CUSTOMCONNSTR_DateAstrum;
    const fromColon = process.env.ConnectionStrings__DateAstrum;
    const connectionString = fromCustom || fromSqlNamed || fromCustomNamed || fromColon;
    if (!connectionString) {
        throw new Error('Missing Azure SQL connection string. Set one of: ' +
            'AZURE_SQL_CONNECTIONSTRING, SQLCONNSTR_DateAstrum, CUSTOMCONNSTR_DateAstrum, or ConnectionStrings__DateAstrum');
    }
    return connectionString;
}
function extractDatabaseName(connectionString) {
    for (const segment of connectionString.split(';')) {
        const [rawKey, ...rawValueParts] = segment.split('=');
        if (!rawKey || rawValueParts.length === 0)
            continue;
        const key = rawKey.trim().toLowerCase();
        if (key === 'database' || key === 'initial catalog') {
            return rawValueParts.join('=').trim() || null;
        }
    }
    return null;
}
function sanitizeSqlError(error) {
    if (!error)
        return 'Unknown error';
    if (typeof error === 'string')
        return error;
    if (error instanceof Error) {
        return sanitizeSqlError({ message: error.message, stack: error.stack });
    }
    const err = error;
    if (!err)
        return 'Unknown error';
    const fragments = [];
    if (err.code)
        fragments.push(`code=${err.code}`);
    if (typeof err.number === 'number')
        fragments.push(`number=${err.number}`);
    if (err.message) {
        fragments.push(err.message.replace(/password\s*=\s*[^;]+/gi, 'password=***'));
    }
    if (err.stack) {
        const [firstLine] = err.stack.split('\n');
        if (firstLine && !fragments.includes(firstLine)) {
            fragments.push(firstLine.replace(/password\s*=\s*[^;]+/gi, 'password=***'));
        }
    }
    return fragments.join(' | ') || 'Unknown SQL error';
}
async function closePool(pool) {
    if (!pool)
        return;
    try {
        await pool.close();
    }
    catch (err) {
        console.error('SQL pool close error', err);
    }
}
async function invalidatePool() {
    if (!poolPromise)
        return;
    try {
        const pool = await poolPromise.catch(() => null);
        await closePool(pool);
    }
    finally {
        poolPromise = null;
    }
}
async function createPool() {
    const rawConnectionString = getAzureSqlConnectionString();
    const normalizedConnectionString = rawConnectionString.trim();
    const hasTimeoutConfigured = /request\s*timeout\s*=/i.test(normalizedConnectionString);
    const timeoutFragment = `Request Timeout=${DEFAULT_REQUEST_TIMEOUT_MS}`;
    const connectionString = hasTimeoutConfigured
        ? normalizedConnectionString.replace(/request\s*timeout\s*=\s*[^;]+/i, timeoutFragment)
        : `${normalizedConnectionString}${normalizedConnectionString.endsWith(';') ? '' : ';'}${timeoutFragment}`;
    const pool = new mssql_1.default.ConnectionPool(connectionString);
    pool.on('error', async (err) => {
        console.error('SQL pool error', err);
        if (isTransientError(err)) {
            await invalidatePool();
        }
    });
    const dbName = extractDatabaseName(normalizedConnectionString) ?? 'DateAstrum';
    console.log(`[database] Attempting connection to ${dbName} (DateAstrum Azure SQL)...`);
    try {
        const connectedPool = await pool.connect();
        connectedPool.requestTimeout = DEFAULT_REQUEST_TIMEOUT_MS;
        console.log(`[database] Connection established to ${dbName} (DateAstrum Azure SQL).`);
        return connectedPool;
    }
    catch (err) {
        console.error(`[database] Connection failed for ${dbName}: ${sanitizeSqlError(err)}`);
        throw err;
    }
}
async function getPool() {
    if (!poolPromise) {
        poolPromise = createPool().catch(async (err) => {
            await invalidatePool();
            throw err;
        });
    }
    return poolPromise;
}
async function withSqlRetry(operation, options) {
    const attempts = Math.max(1, options?.attempts ?? DEFAULT_MAX_RETRIES);
    const baseDelayMs = Math.max(0, options?.baseDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const pool = await getPool();
            return await operation(pool);
        }
        catch (error) {
            lastError = error;
            const shouldRetry = attempt < attempts && isTransientError(error);
            if (shouldRetry) {
                await invalidatePool();
                const delay = baseDelayMs * attempt;
                if (delay > 0) {
                    await wait(delay);
                }
                continue;
            }
            throw error;
        }
    }
    // Should never reach here because we throw when attempts are exhausted.
    throw lastError;
}
