import https from 'https';
import { URLSearchParams } from 'url';

export type AppInsightsQueryResult = {
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string }>;
    rows: unknown[][];
  }>;
};

export interface AppInsightsConfig {
  appId: string;
  apiKey?: string;
  azureAd?: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
  };
  region?: string;
}

class MissingAppInsightsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingAppInsightsConfigError';
  }
}

export function getAppInsightsConfig(): AppInsightsConfig {
  const appId = process.env.APPINSIGHTS_APP_ID?.trim();
  const apiKey = process.env.APPINSIGHTS_API_KEY?.trim();
  const region = process.env.APPINSIGHTS_REGION?.trim();
  const tenantId = process.env.APPINSIGHTS_TENANT_ID?.trim();
  const clientId = process.env.APPINSIGHTS_CLIENT_ID?.trim();
  const clientSecret = process.env.APPINSIGHTS_CLIENT_SECRET?.trim();

  const hasApiKey = Boolean(apiKey);
  const hasAzureAd = Boolean(tenantId && clientId && clientSecret);

  if (!appId || (!hasApiKey && !hasAzureAd)) {
    throw new MissingAppInsightsConfigError(
      'Application Insights configuration is incomplete. Provide APPINSIGHTS_APP_ID plus either APPINSIGHTS_API_KEY or the Azure AD client credentials (APPINSIGHTS_TENANT_ID, APPINSIGHTS_CLIENT_ID, APPINSIGHTS_CLIENT_SECRET).',
    );
  }

  return {
    appId,
    apiKey: hasApiKey ? apiKey : undefined,
    region,
    azureAd: hasAzureAd
      ? {
          tenantId: tenantId!,
          clientId: clientId!,
          clientSecret: clientSecret!,
        }
      : undefined,
  };
}

async function obtainAzureAdToken(azureAd: NonNullable<AppInsightsConfig['azureAd']>): Promise<string> {
  const params = new URLSearchParams({
    client_id: azureAd.clientId,
    client_secret: azureAd.clientSecret,
    scope: 'https://api.applicationinsights.io/.default',
    grant_type: 'client_credentials',
  });

  const requestOptions: https.RequestOptions = {
    hostname: 'login.microsoftonline.com',
    path: `/${encodeURIComponent(azureAd.tenantId)}/oauth2/v2.0/token`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(params.toString()),
    },
  };

  return new Promise<string>((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk) => chunks.push(chunk));

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body) as { access_token?: string; token_type?: string };
            if (!parsed.access_token) {
              reject(new Error('Azure AD response did not include an access token.'));
              return;
            }
            resolve(parsed.access_token);
          } catch (parseError) {
            reject(new Error(`Failed to parse Azure AD token response: ${(parseError as Error).message}`));
          }
        } else {
          reject(
            new Error(
              `Azure AD token request failed with status ${res.statusCode}: ${body || 'No response body.'}`,
            ),
          );
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(params.toString());
    req.end();
  });
}

async function performAppInsightsQuery(
  appId: string,
  payload: string,
  authHeaders: Record<string, string>,
): Promise<AppInsightsQueryResult> {
  const requestOptions: https.RequestOptions = {
    hostname: 'api.applicationinsights.io',
    path: `/v1/apps/${encodeURIComponent(appId)}/query`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      ...authHeaders,
    },
  };

  return new Promise<AppInsightsQueryResult>((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk) => chunks.push(chunk));

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');

        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body) as AppInsightsQueryResult;
            resolve(parsed);
          } catch (parseError) {
            reject(new Error(`Failed to parse Application Insights response: ${(parseError as Error).message}`));
          }
        } else {
          reject(
            new Error(
              `Application Insights query failed with status ${res.statusCode}: ${body || 'No response body.'}`,
            ),
          );
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

export async function executeAppInsightsQuery(
  query: string,
  options?: { timespan?: string },
): Promise<AppInsightsQueryResult> {
  const { appId, apiKey, azureAd } = getAppInsightsConfig();
  const payload = JSON.stringify({
    query,
    ...(options?.timespan ? { timespan: options.timespan } : {}),
  });

  const attemptWithApiKey = async () => {
    if (!apiKey) {
      throw new Error('API key authentication is not configured.');
    }
    return performAppInsightsQuery(appId, payload, { 'x-api-key': apiKey });
  };

  const attemptWithAzureAd = async () => {
    if (!azureAd) {
      throw new Error('Azure AD authentication is not configured for Application Insights.');
    }
    const token = await obtainAzureAdToken(azureAd);
    return performAppInsightsQuery(appId, payload, { Authorization: `Bearer ${token}` });
  };

  if (apiKey) {
    try {
      return await attemptWithApiKey();
    } catch (error) {
      const message = String(error?.message ?? error);
      const apiDisabled =
        message.includes('status 403') &&
        (message.includes('Api keys authorization is disabled') || message.includes('InsufficientAccessError'));
      if (apiDisabled && azureAd) {
        return attemptWithAzureAd();
      }
      throw error;
    }
  }

  // fall back to Azure AD if no API key was provided
  return attemptWithAzureAd();
}

export function tableToObjects<T extends Record<string, unknown>>(result: AppInsightsQueryResult): T[] {
  const table = result.tables?.[0];
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
    return [];
  }

  const { columns, rows } = table;

  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, index) => {
      obj[col.name] = row[index];
    });
    return obj as T;
  });
}
