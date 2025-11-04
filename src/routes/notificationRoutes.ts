import express from 'express';
import * as notificationController from '../controllers/notificationController';

const router = express.Router();

// Get all notifications for a user
router.get('/:userId', notificationController.getNotifications);

// Mark a notification as read
router.patch('/:notificationId/read', notificationController.markNotificationRead);

export default router;
