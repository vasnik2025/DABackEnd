import { Router } from 'express';
import { listPublicLocationBeacons } from '../controllers/locationBeaconController';

const router = Router();

router.get('/', listPublicLocationBeacons);

export default router;
