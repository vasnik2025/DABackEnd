"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMonitoringSummary = getMonitoringSummary;
const appInsightsService_1 = require("../services/appInsightsService");
async function getMonitoringSummary(_req, res) {
    try {
        const summary = await (0, appInsightsService_1.fetchMonitoringSummary)();
        return res.status(200).json(summary);
    }
    catch (error) {
        console.error('[adminMonitoring] Failed to fetch monitoring summary', error);
        return res.status(500).json({
            message: 'Unable to retrieve monitoring data from Application Insights. Please try again later.',
        });
    }
}
