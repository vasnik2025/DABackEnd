Changes:
1) authController.ts
   - Added FRONTEND_URL sanitization (trims trailing slash)
   - Added GET redirect to frontend success pages after verification
   - Added POST /auth/resend-verifications handler to regenerate tokens for primary + partner and resend both emails

2) utils/emailService.ts
   - Added BACKEND_URL + sanitized FRONTEND_URL
   - Primary links now point directly to backend verify endpoints (with frontend alternate link in the email)
   - Partner links updated similarly

3) routes/authRoutes.ts
   - Registered router.post('/resend-verifications', resendAllVerifications)

Required App Settings:
   FRONTEND_URL = https://swingerunion.com
   BACKEND_URL  = https://api.swingerunion.com
