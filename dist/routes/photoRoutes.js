"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const photoController = __importStar(require("../controllers/photoController"));
// import {  protect  } from "../middleware/authMiddleware"); // Assuming JWT/session protection
const router = express_1.default.Router();
// router.use(protect); // Apply protection to all photo routes
router.get('/user/:userId', photoController.getUserPhotos);
router.get('/:photoId/details', photoController.getPhotoDetails);
router.post('/user/:userId', photoController.uploadPhoto);
router.put('/:photoId/user/:userId/public', photoController.updatePhotoPublicStatus);
router.put('/:photoId/user/:userId/replace', photoController.replacePhoto);
router.delete('/:photoId/user/:userId', photoController.deletePhoto);
router.post('/send', photoController.sendPhoto);
router.get('/shared/received/:recipientUserId', photoController.getReceivedSharedPhotos);
router.get('/shared/sent/:senderUserId', photoController.getSentSharedPhotos);
router.put('/shared/:shareId/status', photoController.updateSharedPhotoStatus);
router.post('/:photoId/like', photoController.toggleLikePhoto);
router.post('/:photoId/comments', photoController.addComment);
router.delete('/comments/:commentId', photoController.deleteComment);
exports.default = router;
