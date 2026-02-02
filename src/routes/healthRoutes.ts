// src/routes/healthRoutes.ts
import express from 'express';
import { healthCheck } from '../controllers/healthController';

const router = express.Router();

/**
 * @swagger
 * /api/healthcheck:
 *   get:
 *     tags:
 *      - Monitoramento
 *     summary: Verificação de status da API
 *     description: Retorna o status de funcionamento da API e o ambiente atual.
 *     responses:
 *       200:
 *         description: API em funcionamento
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                   example: "API em funcionamento - ambiente: desenvolvimento"
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 messageError:
 *                   type: string
 *                   nullable: true
 *                   example: null
 *                 errors:
 *                   type: string
 *                   nullable: true
 *                   example: null
 */
router.get('/healthcheck', healthCheck);

export default router;
