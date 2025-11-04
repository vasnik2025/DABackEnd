import { Router } from 'express';
import {
  handleAdminApprove,
  handleAdminReject,
  handleAdminListSingleInvites,
  handleCreateInvite,
  handleDeclineInvite,
  handleListInvites,
  handleRevokeInvite,
  handleSubmitMedia,
  handleSubmitProfile,
  handleGetOwnSingleProfile,
  handleCompleteActivation,
  handleValidateToken,
  handleUpdateOwnSingleProfile,
  handleListActiveSingles,
  handleGetActiveSingleDetail,
  handleCreateSingleReview,
} from '../controllers/singleMemberController';
import { readUser } from '../middleware/auth';

const router = Router();

// Couples-only endpoints (authentication required via cookie)
router.use(readUser);
router.post('/invites', handleCreateInvite);
router.get('/invites', handleListInvites);
router.delete('/invites/:inviteId', handleRevokeInvite);
router.post('/invites/:inviteId/decline', handleDeclineInvite);
router.get('/me/profile', handleGetOwnSingleProfile);
router.put('/me/profile', handleUpdateOwnSingleProfile);
router.get('/active', handleListActiveSingles);
router.get('/active/:singleUserId', handleGetActiveSingleDetail);
router.post('/active/:singleUserId/reviews', handleCreateSingleReview);

// Public onboarding endpoints (no auth cookie required)
router.post('/onboarding/validate', handleValidateToken);
router.post('/onboarding/profile', handleSubmitProfile);
router.post('/onboarding/media', handleSubmitMedia);
router.post('/onboarding/activate', handleCompleteActivation);

// Admin tooling (TODO: add admin guard when role system is ready)
router.get('/admin/invites', readUser, handleAdminListSingleInvites);
router.post('/admin/invites/:inviteId/approve', readUser, handleAdminApprove);
router.post('/admin/invites/:inviteId/reject', readUser, handleAdminReject);

export default router;
