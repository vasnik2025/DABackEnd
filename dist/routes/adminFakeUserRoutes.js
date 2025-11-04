"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminFakeUserController_1 = require("../controllers/adminFakeUserController");
const router = (0, express_1.Router)();
router.get('/', adminFakeUserController_1.listFakeUsers);
router.put('/:fakeUserId', adminFakeUserController_1.updateFakeUser);
router.delete('/:fakeUserId', adminFakeUserController_1.deleteFakeUser);
exports.default = router;
