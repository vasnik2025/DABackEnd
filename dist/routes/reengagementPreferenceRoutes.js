"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reengagementController_1 = require("../controllers/reengagementController");
const router = (0, express_1.Router)();
router.get('/validate', reengagementController_1.handleValidateReengagementPreferences);
router.post('/opt-out', reengagementController_1.handleOptOutReengagementPreferences);
exports.default = router;
