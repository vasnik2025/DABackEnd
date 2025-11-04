"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const verificationReminderController_1 = require("../controllers/verificationReminderController");
const router = (0, express_1.Router)();
router.get('/validate', verificationReminderController_1.handleValidateVerificationPreferences);
router.post('/opt-out', verificationReminderController_1.handleOptOutVerificationPreferences);
exports.default = router;
