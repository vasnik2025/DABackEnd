// FIX: Changed type-only import to standard import to fix type resolution.
import express, { Request, Response, NextFunction } from 'express';
import * as authController from '../controllers/authController';
import { viewPasswordShare } from '../controllers/passwordShareController';
// FIX: Changed type-only import to standard import to fix type resolution.
import type { AuthedRequest } from '../middleware/auth';

// Normalize aliases the UI might send so the controllers get {email,password}
function normalizeAuthInput(req: Request, _res: Response, next: NextFunction) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const email = String(b.email ?? b.usernameOrEmail ?? b.identifier ?? '')
    .trim()
    .toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  req.body = { ...b, email, password };
  next();
}

const router = express.Router();

router.post('/register', normalizeAuthInput, authController.register);
router.post('/login',    normalizeAuthInput, authController.login);
router.post('/logout',   authController.logout);
router.get('/me', authController.me as (req: AuthedRequest, res: Response) => void);

router.post('/forgot-password', authController.initiatePasswordReset);
router.post('/forgot-password/verify', authController.verifyPasswordResetCode);
router.post('/reset-password', authController.resetPasswordWithToken);

// Verification routes
router.post('/verification/resend', authController.resendVerificationEmails);
router.get('/verify-email', authController.verifyEmail);
router.post('/verify-email', authController.verifyEmailApi);
router.get('/verify-partner-email', authController.verifyPartnerEmail);
router.post('/verify-partner-email', authController.verifyPartnerEmailApi);
router.get('/password-share/:token', viewPasswordShare);


export default router;
