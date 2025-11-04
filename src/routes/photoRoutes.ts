
import express from 'express';
import * as photoController from '../controllers/photoController';
// import {  protect  } from "../middleware/authMiddleware"); // Assuming JWT/session protection

const router = express.Router();

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

export default router;