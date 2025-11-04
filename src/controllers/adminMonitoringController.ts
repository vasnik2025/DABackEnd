import type { Request, Response } from 'express';
import { fetchMonitoringSummary } from '../services/appInsightsService';

export async function getMonitoringSummary(_req: Request, res: Response): Promise<Response> {
  try {
    const summary = await fetchMonitoringSummary();
    return res.status(200).json(summary);
  } catch (error) {
    console.error('[adminMonitoring] Failed to fetch monitoring summary', error);
    return res.status(500).json({
      message: 'Unable to retrieve monitoring data from Application Insights. Please try again later.',
    });
  }
}

