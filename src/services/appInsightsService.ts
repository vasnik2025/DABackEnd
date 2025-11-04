import { executeAppInsightsQuery, tableToObjects } from '../config/appInsights';
import type { AppInsightsQueryResult } from '../config/appInsights';
import { sql, withSqlRetry } from '../config/db';
import { fetchPaypalMonitoringSummary, type PaypalMonitoringSummary } from './paypalMonitoringService';

type NumericResultRow = Record<string, number | string>;

const REQUESTS_PER_HOUR_QUERY = `
requests
| where timestamp > ago(24h)
| summarize Count = count() by bin(timestamp, 1h)
| order by timestamp asc
`;

const FAILED_REQUESTS_PER_HOUR_QUERY = `
requests
| where timestamp > ago(24h)
| where success == false
| summarize Count = count() by bin(timestamp, 1h)
| order by timestamp asc
`;

const AVERAGE_DURATION_QUERY = `
requests
| where timestamp > ago(24h)
| summarize AvgDuration = avg(duration)
`;

const TOP_FAILED_REQUESTS_QUERY = `
requests
| where timestamp > ago(24h)
| where success == false
| summarize FailureCount = count() by name
| top 5 by FailureCount desc
`;

const TRACE_SEVERITY_COUNTS_QUERY = `
traces
| where timestamp > ago(24h)
| summarize Count = count() by severityLevel
| order by severityLevel asc
`;

const DEPENDENCY_FAILURES_QUERY = `
dependencies
| where timestamp > ago(24h)
| where success == false
| summarize FailureCount = count() by target
| top 5 by FailureCount desc
`;

const AVAILABILITY_QUERY = `
availabilityResults
| where timestamp > ago(7d)
| summarize Availability = avg(todouble(success)) * 100.0 by bin(timestamp, 1d)
| order by timestamp asc
`;

const CUSTOM_EVENT_USAGE_QUERY = `
customEvents
| where timestamp > ago(7d)
| summarize Events = count() by name
| top 10 by Events desc
`;

function parseDurationToMilliseconds(value: unknown): number | null {
  if (typeof value !== 'string' || !value.length) {
    return null;
  }

  // duration format: HH:MM:SS.MMMMMMM
  const match = value.match(
    /^(?<hours>\d+):(?<minutes>\d+):(?<seconds>\d+)(?:\.(?<fraction>\d+))?$/,
  );
  if (!match || !match.groups) {
    return null;
  }

  const hours = Number(match.groups.hours ?? 0);
  const minutes = Number(match.groups.minutes ?? 0);
  const seconds = Number(match.groups.seconds ?? 0);
  const fraction = Number(`0.${match.groups.fraction ?? '0'}`);

  if ([hours, minutes, seconds, fraction].some((part) => Number.isNaN(part))) {
    return null;
  }

  const totalSeconds = hours * 3600 + minutes * 60 + seconds + fraction;
  return Math.round(totalSeconds * 1000);
}

export type RequestsPerHourPoint = {
  timestamp: string;
  Count: number;
};

export type FailedRequestsPerHourPoint = {
  timestamp: string;
  Count: number;
};

export type FailedRequestSummary = {
  name: string;
  FailureCount: number;
};

export type TraceSeveritySummary = {
  severityLevel: number;
  Count: number;
};

export type DependencyFailureSummary = {
  target: string;
  FailureCount: number;
};

export type AvailabilitySummary = {
  timestamp: string;
  Availability: number;
};

export type CustomEventSummary = {
  name: string;
  Events: number;
};

export type CountryPageViewSummary = {
  country: string;
  viewCount: number;
};

export interface MonitoringSummary {
  requestsPerHour: RequestsPerHourPoint[];
  failedRequestsPerHour: FailedRequestsPerHourPoint[];
  averageRequestDurationMs: number | null;
  topFailedRequests: FailedRequestSummary[];
  traceSeverityCounts: TraceSeveritySummary[];
  dependencyFailures: DependencyFailureSummary[];
  availabilitySeries: AvailabilitySummary[];
  customEventActivity: CustomEventSummary[];
  paypal: PaypalMonitoringSummary;
  pageViewsByCountry: CountryPageViewSummary[];
}

function extractAverageDuration(result: AppInsightsQueryResult): number | null {
  const rows = tableToObjects<NumericResultRow>(result);
  if (!rows.length) return null;
  return parseDurationToMilliseconds(rows[0].AvgDuration);
}

export async function fetchMonitoringSummary(): Promise<MonitoringSummary> {
  const [
    requestsPerHourResult,
    failedRequestsPerHourResult,
    averageDurationResult,
    topFailedRequestsResult,
    traceSeverityCountsResult,
    dependencyFailuresResult,
    availabilityResult,
    customEventsResult,
    paypalSummary,
    pageViewsByCountry,
  ] = await Promise.all([
    executeAppInsightsQuery(REQUESTS_PER_HOUR_QUERY),
    executeAppInsightsQuery(FAILED_REQUESTS_PER_HOUR_QUERY),
    executeAppInsightsQuery(AVERAGE_DURATION_QUERY),
    executeAppInsightsQuery(TOP_FAILED_REQUESTS_QUERY),
    executeAppInsightsQuery(TRACE_SEVERITY_COUNTS_QUERY),
    executeAppInsightsQuery(DEPENDENCY_FAILURES_QUERY),
    executeAppInsightsQuery(AVAILABILITY_QUERY),
    executeAppInsightsQuery(CUSTOM_EVENT_USAGE_QUERY),
    fetchPaypalMonitoringSummary(),
    fetchSplashPageViewsByCountry(),
  ]);

  return {
    requestsPerHour: tableToObjects<RequestsPerHourPoint>(requestsPerHourResult),
    failedRequestsPerHour: tableToObjects<FailedRequestsPerHourPoint>(failedRequestsPerHourResult),
    averageRequestDurationMs: extractAverageDuration(averageDurationResult),
    topFailedRequests: tableToObjects<FailedRequestSummary>(topFailedRequestsResult),
    traceSeverityCounts: tableToObjects<TraceSeveritySummary>(traceSeverityCountsResult),
    dependencyFailures: tableToObjects<DependencyFailureSummary>(dependencyFailuresResult),
    availabilitySeries: tableToObjects<AvailabilitySummary>(availabilityResult),
    customEventActivity: tableToObjects<CustomEventSummary>(customEventsResult),
    paypal: paypalSummary,
    pageViewsByCountry,
  };
}

async function fetchSplashPageViewsByCountry(limit = 20, windowDays = 7): Promise<CountryPageViewSummary[]> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const rows = await withSqlRetry(async (pool) => {
    const result = await pool
      .request()
      .input('WindowStart', sql.DateTimeOffset, windowStart)
      .input('Limit', sql.Int, limit)
      .query(`
        WITH CountryCounts AS (
          SELECT
            CASE
              WHEN Country IS NULL OR LTRIM(RTRIM(Country)) = '' THEN 'Unknown'
              ELSE LTRIM(RTRIM(Country))
            END AS Country,
            COUNT_BIG(*) AS Views
          FROM dbo.SplashPageViews WITH (NOLOCK)
          WHERE CreatedAt >= @WindowStart
          GROUP BY CASE
            WHEN Country IS NULL OR LTRIM(RTRIM(Country)) = '' THEN 'Unknown'
            ELSE LTRIM(RTRIM(Country))
          END
        )
        SELECT TOP (@Limit) Country, Views
        FROM CountryCounts
        ORDER BY Views DESC, Country ASC;
      `);

    return (result.recordset ?? []) as Array<{ Country?: string; Views?: number }>;
  });

  const aggregate = new Map<string, number>();

  rows.forEach((row) => {
    const viewCount = Number(row.Views ?? 0) || 0;
    if (viewCount <= 0) return;
    const countryName = resolveCountryDisplayName(row.Country);
    aggregate.set(countryName, (aggregate.get(countryName) ?? 0) + viewCount);
  });

  return Array.from(aggregate.entries())
    .map(([country, viewCount]) => ({ country, viewCount }))
    .sort((a, b) => b.viewCount - a.viewCount || a.country.localeCompare(b.country))
    .slice(0, Math.max(1, limit));
}

const countryDisplayNames =
  typeof Intl !== 'undefined' && typeof (Intl as any).DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

const COUNTRY_CODE_OVERRIDES: Record<string, string> = {
  UK: 'United Kingdom',
  GB: 'United Kingdom',
  EL: 'Greece',
  GR: 'Greece',
};

function resolveCountryDisplayName(value?: string | null): string {
  if (!value) return 'Unknown';
  const trimmed = value.trim();
  if (!trimmed.length) return 'Unknown';

  const upper = trimmed.toUpperCase();
  if (upper === 'UNKNOWN' || upper === 'N/A') return 'Unknown';

  const override = COUNTRY_CODE_OVERRIDES[upper];
  if (override) return override;

  if (/^[A-Z]{2,3}$/.test(upper)) {
    const label = countryDisplayNames?.of(upper);
    if (label) return label;
  }

  return trimmed.replace(/\b\w/g, (char) => char.toUpperCase());
}
