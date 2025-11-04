
import express from 'express';
import { findLifestyleLocations } from '../controllers/lifestyleController';

const router = express.Router();

router.post('/find', findLifestyleLocations);

export default router;
