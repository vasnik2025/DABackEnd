import { Router } from 'express';
import { readUser } from '../middleware/auth';
import {
  handleListReengagementRecipients,
  handleGetReengagementSummary,
  handleSendReengagementReminders,
} from '../controllers/reengagementController';

const router = Router();

router.use(readUser);

router.get('/summary', handleGetReengagementSummary);
router.get('/recipients', handleListReengagementRecipients);
router.post('/send', handleSendReengagementReminders);

export default router;
