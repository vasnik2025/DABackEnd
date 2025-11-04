import { Router } from 'express';
import {
  getUserStats,
  getAllUsers,
  getUserById,
  updateUser,
  getUserFavorites,
  getUserFavoriteSummaries,
  getUserAdmirers,
  toggleFavorite,
  initiateAccountDeletion,
  verifyAccountDeletionCode,
} from '../controllers/userController';
import {
  getLocationBeacon,
  upsertLocationBeacon,
  revokeLocationBeacon,
} from '../controllers/locationBeaconController';

const router = Router();

// GET /api/users/stats
router.get('/stats', getUserStats);

// GET /api/users/admin/all
router.get('/admin/all', getAllUsers);

// GET /api/users
router.get('/', getAllUsers);

// GET /api/users/:userId
router.get('/:userId/favorites/summary', getUserFavoriteSummaries);
router.get('/:userId/favorites', getUserFavorites);
router.get('/:userId/admirers', getUserAdmirers);
router.post('/:userId/favorites/toggle', toggleFavorite);
router.post('/:userId/delete/initiate', initiateAccountDeletion);
router.post('/:userId/delete/verify', verifyAccountDeletionCode);
router.get('/:userId/location-beacon', getLocationBeacon);
router.post('/:userId/location-beacon', upsertLocationBeacon);
router.delete('/:userId/location-beacon', revokeLocationBeacon);

router.get('/:userId', getUserById);

// PUT /api/users/:userId
router.put('/:userId', updateUser);

export default router;
