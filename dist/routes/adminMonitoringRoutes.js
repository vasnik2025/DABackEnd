"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminMonitoringController_1 = require("../controllers/adminMonitoringController");
const router = (0, express_1.Router)();
router.get('/summary', adminMonitoringController_1.getMonitoringSummary);
exports.default = router;
