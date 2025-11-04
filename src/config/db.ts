import sql from 'mssql';

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 200;

let poolPromise: Promise<sql.ConnectionPool> | null = null;

const TRANSIENT_ERROR_CODES = new Set(['ESOCKET', 'ECONNRESET', 'ETIMEOUT']);
const TRANSIENT_ERROR_MESSAGES = ['connection lost', 'write econnreset', 'timeout'];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientError(error: unknown): boolean {
  const err = error as { code?: string; message?: string | null } | undefined;
  if (!err) return false;
  const code = (err.code ?? '').toUpperCase();
  if (code && TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }
  const message = (err.message ?? '').toLowerCase();
  return TRANSIENT_ERROR_MESSAGES.some((fragment) => message.includes(fragment));
}

function getAzureSqlConnectionString(): string {
  const fromCustom = process.env.AZURE_SQL_CONNECTIONSTRING;
  const fromSqlNamed = process.env.SQLCONNSTR_swingerunion;
  const fromCustomNamed = process.env.CUSTOMCONNSTR_swingerunion;
  const fromColon = process.env.ConnectionStrings__swingerunion;

  const connectionString = fromCustom || fromSqlNamed || fromCustomNamed || fromColon;
  if (!connectionString) {
    throw new Error(
      'Missing Azure SQL connection string. Set one of: ' +
        'AZURE_SQL_CONNECTIONSTRING, SQLCONNSTR_swingerunion, CUSTOMCONNSTR_swingerunion, or ConnectionStrings__swingerunion',
    );
  }
  return connectionString;
}

async function closePool(pool: sql.ConnectionPool | undefined | null) {
  if (!pool) return;
  try {
    await pool.close();
  } catch (err) {
    console.error('SQL pool close error', err);
  }
}

async function invalidatePool() {
  if (!poolPromise) return;
  try {
    const pool = await poolPromise.catch(() => null);
    await closePool(pool);
  } finally {
    poolPromise = null;
  }
}

async function createPool(): Promise<sql.ConnectionPool> {
  const rawConnectionString = getAzureSqlConnectionString();
  const normalizedConnectionString = rawConnectionString.trim();
  const hasTimeoutConfigured = /request\s*timeout\s*=/i.test(normalizedConnectionString);
  const timeoutFragment = `Request Timeout=${DEFAULT_REQUEST_TIMEOUT_MS}`;
  const connectionString = hasTimeoutConfigured
    ? normalizedConnectionString.replace(/request\s*timeout\s*=\s*[^;]+/i, timeoutFragment)
    : `${normalizedConnectionString}${normalizedConnectionString.endsWith(';') ? '' : ';'}${timeoutFragment}`;
  const pool = new sql.ConnectionPool(connectionString);

  pool.on('error', async (err) => {
    console.error('SQL pool error', err);
    if (isTransientError(err)) {
      await invalidatePool();
    }
  });

  const connectedPool = await pool.connect();
  (connectedPool as unknown as { requestTimeout?: number }).requestTimeout = DEFAULT_REQUEST_TIMEOUT_MS;
  console.log('Connected to Azure SQL.');
  return connectedPool;
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = createPool().catch(async (err) => {
      await invalidatePool();
      throw err;
    });
  }
  return poolPromise;
}

export async function withSqlRetry<T>(
  operation: (pool: sql.ConnectionPool) => Promise<T>,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = Math.max(1, options?.attempts ?? DEFAULT_MAX_RETRIES);
  const baseDelayMs = Math.max(0, options?.baseDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const pool = await getPool();
      return await operation(pool);
    } catch (error) {
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

export { sql };
