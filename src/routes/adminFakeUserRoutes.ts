import { Router } from 'express';
import {
  deleteFakeUser,
  listFakeUsers,
  updateFakeUser,
} from '../controllers/adminFakeUserController';

const router = Router();

router.get('/', listFakeUsers);
router.put('/:fakeUserId', updateFakeUser);
router.delete('/:fakeUserId', deleteFakeUser);

export default router;
