import { Router } from 'express';
import {
  handleOptOutReengagementPreferences,
  handleValidateReengagementPreferences,
} from '../controllers/reengagementController';

const router = Router();

router.get('/validate', handleValidateReengagementPreferences);
router.post('/opt-out', handleOptOutReengagementPreferences);

export default router;
