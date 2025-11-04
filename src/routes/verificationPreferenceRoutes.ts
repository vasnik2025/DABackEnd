import { Router } from 'express';
import {
  handleOptOutVerificationPreferences,
  handleValidateVerificationPreferences,
} from '../controllers/verificationReminderController';

const router = Router();

router.get('/validate', handleValidateVerificationPreferences);
router.post('/opt-out', handleOptOutVerificationPreferences);

export default router;
