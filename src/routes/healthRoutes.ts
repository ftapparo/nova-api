// src/routes/healthRoutes.ts
import express from 'express';
import { healthCheck } from '../controllers/healthController';

const router = express.Router();

router.get('/healthcheck', healthCheck);

export default router;
