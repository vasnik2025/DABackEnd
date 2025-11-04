"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminPhotoGalleryController_1 = require("../controllers/adminPhotoGalleryController");
const router = (0, express_1.Router)();
router.get('/', adminPhotoGalleryController_1.listRealCouplePhotos);
exports.default = router;
