import { Router } from 'express';
import { handleGetZodiacPrediction } from '../controllers/aiController';

const router = Router();

router.get('/zodiac/prediction', handleGetZodiacPrediction);

export default router;
