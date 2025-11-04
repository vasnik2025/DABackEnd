"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const singleMemberController_1 = require("../controllers/singleMemberController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Couples-only endpoints (authentication required via cookie)
router.use(auth_1.readUser);
router.post('/invites', singleMemberController_1.handleCreateInvite);
router.get('/invites', singleMemberController_1.handleListInvites);
router.delete('/invites/:inviteId', singleMemberController_1.handleRevokeInvite);
router.post('/invites/:inviteId/decline', singleMemberController_1.handleDeclineInvite);
router.get('/me/profile', singleMemberController_1.handleGetOwnSingleProfile);
router.put('/me/profile', singleMemberController_1.handleUpdateOwnSingleProfile);
router.get('/active', singleMemberController_1.handleListActiveSingles);
router.get('/active/:singleUserId', singleMemberController_1.handleGetActiveSingleDetail);
router.post('/active/:singleUserId/reviews', singleMemberController_1.handleCreateSingleReview);
// Public onboarding endpoints (no auth cookie required)
router.post('/onboarding/validate', singleMemberController_1.handleValidateToken);
router.post('/onboarding/profile', singleMemberController_1.handleSubmitProfile);
router.post('/onboarding/media', singleMemberController_1.handleSubmitMedia);
router.post('/onboarding/activate', singleMemberController_1.handleCompleteActivation);
// Admin tooling (TODO: add admin guard when role system is ready)
router.get('/admin/invites', auth_1.readUser, singleMemberController_1.handleAdminListSingleInvites);
router.post('/admin/invites/:inviteId/approve', auth_1.readUser, singleMemberController_1.handleAdminApprove);
router.post('/admin/invites/:inviteId/reject', auth_1.readUser, singleMemberController_1.handleAdminReject);
exports.default = router;
