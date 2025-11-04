"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const locationBeaconController_1 = require("../controllers/locationBeaconController");
const router = (0, express_1.Router)();
router.get('/', locationBeaconController_1.listPublicLocationBeacons);
exports.default = router;
