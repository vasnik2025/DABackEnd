"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const locationBeaconController_1 = require("../controllers/locationBeaconController");
const router = (0, express_1.Router)();
// GET /api/users/stats
router.get('/stats', userController_1.getUserStats);
// GET /api/users/admin/all
router.get('/admin/all', userController_1.getAllUsers);
// GET /api/users
router.get('/', userController_1.getAllUsers);
// GET /api/users/:userId
router.get('/:userId/favorites/summary', userController_1.getUserFavoriteSummaries);
router.get('/:userId/favorites', userController_1.getUserFavorites);
router.get('/:userId/admirers', userController_1.getUserAdmirers);
router.post('/:userId/favorites/toggle', userController_1.toggleFavorite);
router.post('/:userId/delete/initiate', userController_1.initiateAccountDeletion);
router.post('/:userId/delete/verify', userController_1.verifyAccountDeletionCode);
router.get('/:userId/location-beacon', locationBeaconController_1.getLocationBeacon);
router.post('/:userId/location-beacon', locationBeaconController_1.upsertLocationBeacon);
router.delete('/:userId/location-beacon', locationBeaconController_1.revokeLocationBeacon);
router.get('/:userId', userController_1.getUserById);
// PUT /api/users/:userId
router.put('/:userId', userController_1.updateUser);
exports.default = router;
