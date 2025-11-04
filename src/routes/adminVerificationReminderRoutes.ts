import { Router } from 'express';
import { readUser } from '../middleware/auth';
import {
  handleListVerificationRecipients,
  handleSendVerificationReminders,
  handleVerificationReminderSummary,
} from '../controllers/verificationReminderController';

const router = Router();

router.use(readUser);

router.get('/summary', handleVerificationReminderSummary);
router.get('/recipients', handleListVerificationRecipients);
router.post('/send', handleSendVerificationReminders);

export default router;
