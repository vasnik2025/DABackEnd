"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchMonitoringSummary = fetchMonitoringSummary;
const appInsights_1 = require("../config/appInsights");
const db_1 = require("../config/db");
const paypalMonitoringService_1 = require("./paypalMonitoringService");
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
function parseDurationToMilliseconds(value) {
    if (typeof value !== 'string' || !value.length) {
        return null;
    }
    // duration format: HH:MM:SS.MMMMMMM
    const match = value.match(/^(?<hours>\d+):(?<minutes>\d+):(?<seconds>\d+)(?:\.(?<fraction>\d+))?$/);
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
function extractAverageDuration(result) {
    const rows = (0, appInsights_1.tableToObjects)(result);
    if (!rows.length)
        return null;
    return parseDurationToMilliseconds(rows[0].AvgDuration);
}
async function fetchMonitoringSummary() {
    const [requestsPerHourResult, failedRequestsPerHourResult, averageDurationResult, topFailedRequestsResult, traceSeverityCountsResult, dependencyFailuresResult, availabilityResult, customEventsResult, paypalSummary, pageViewsByCountry,] = await Promise.all([
        (0, appInsights_1.executeAppInsightsQuery)(REQUESTS_PER_HOUR_QUERY),
        (0, appInsights_1.executeAppInsightsQuery)(FAILED_REQUESTS_PER_HOUR_QUERY),
        (0, appInsights_1.executeAppInsightsQuery)(AVERAGE_DURATION_QUERY),
        (0, appInsights_1.executeAppInsightsQuery)(TOP_FAILED_REQUESTS_QUERY),
        (0, appInsights_1.executeAppInsightsQuery)(TRACE_SEVERITY_COUNTS_QUERY),
        (0, appInsights_1.executeAppInsightsQuery)(DEPENDENCY_FAILURES_QUERY),
        (0, appInsights_1.executeAppInsightsQuery)(AVAILABILITY_QUERY),
        (0, appInsights_1.executeAppInsightsQuery)(CUSTOM_EVENT_USAGE_QUERY),
        (0, paypalMonitoringService_1.fetchPaypalMonitoringSummary)(),
        fetchSplashPageViewsByCountry(),
    ]);
    return {
        requestsPerHour: (0, appInsights_1.tableToObjects)(requestsPerHourResult),
        failedRequestsPerHour: (0, appInsights_1.tableToObjects)(failedRequestsPerHourResult),
        averageRequestDurationMs: extractAverageDuration(averageDurationResult),
        topFailedRequests: (0, appInsights_1.tableToObjects)(topFailedRequestsResult),
        traceSeverityCounts: (0, appInsights_1.tableToObjects)(traceSeverityCountsResult),
        dependencyFailures: (0, appInsights_1.tableToObjects)(dependencyFailuresResult),
        availabilitySeries: (0, appInsights_1.tableToObjects)(availabilityResult),
        customEventActivity: (0, appInsights_1.tableToObjects)(customEventsResult),
        paypal: paypalSummary,
        pageViewsByCountry,
    };
}
async function fetchSplashPageViewsByCountry(limit = 20, windowDays = 7) {
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const rows = await (0, db_1.withSqlRetry)(async (pool) => {
        const result = await pool
            .request()
            .input('WindowStart', db_1.sql.DateTimeOffset, windowStart)
            .input('Limit', db_1.sql.Int, limit)
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
        return (result.recordset ?? []);
    });
    const aggregate = new Map();
    rows.forEach((row) => {
        const viewCount = Number(row.Views ?? 0) || 0;
        if (viewCount <= 0)
            return;
        const countryName = resolveCountryDisplayName(row.Country);
        aggregate.set(countryName, (aggregate.get(countryName) ?? 0) + viewCount);
    });
    return Array.from(aggregate.entries())
        .map(([country, viewCount]) => ({ country, viewCount }))
        .sort((a, b) => b.viewCount - a.viewCount || a.country.localeCompare(b.country))
        .slice(0, Math.max(1, limit));
}
const countryDisplayNames = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;
const COUNTRY_CODE_OVERRIDES = {
    UK: 'United Kingdom',
    GB: 'United Kingdom',
    EL: 'Greece',
    GR: 'Greece',
};
function resolveCountryDisplayName(value) {
    if (!value)
        return 'Unknown';
    const trimmed = value.trim();
    if (!trimmed.length)
        return 'Unknown';
    const upper = trimmed.toUpperCase();
    if (upper === 'UNKNOWN' || upper === 'N/A')
        return 'Unknown';
    const override = COUNTRY_CODE_OVERRIDES[upper];
    if (override)
        return override;
    if (/^[A-Z]{2,3}$/.test(upper)) {
        const label = countryDisplayNames?.of(upper);
        if (label)
            return label;
    }
    return trimmed.replace(/\b\w/g, (char) => char.toUpperCase());
}
