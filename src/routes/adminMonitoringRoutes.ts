import { Router } from 'express';
import { getMonitoringSummary } from '../controllers/adminMonitoringController';

const router = Router();

router.get('/summary', getMonitoringSummary);

export default router;

