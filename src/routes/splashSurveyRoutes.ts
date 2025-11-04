import { Router } from 'express';
import {
  getSplashSurveyStats,
  recordSplashSurveyView,
  submitSplashSurvey,
  submitSplashVisitorEmail,
  adminListSplashVisitorEmails,
} from '../controllers/splashSurveyController';
import { readUser } from '../middleware/auth';

const router = Router();

router.get('/stats', getSplashSurveyStats);
router.post('/survey', submitSplashSurvey);
router.post('/view', recordSplashSurveyView);
router.post('/visitor-email', submitSplashVisitorEmail);
router.get('/admin/visitor-emails', readUser, adminListSplashVisitorEmails);

export default router;
