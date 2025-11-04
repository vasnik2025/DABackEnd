import { Router } from 'express';
import { listRealCouplePhotos } from '../controllers/adminPhotoGalleryController';

const router = Router();

router.get('/', listRealCouplePhotos);

export default router;

