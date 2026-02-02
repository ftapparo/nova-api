// src/routes/freedomAccessRoutes.ts
import { Router } from 'express';
import {
  checkAccessPermission,
  registerNewAccess,
  allowPedestrianAccess,
  allowvehicleAccess
} from '../controllers/freedomController';
import { proansiValidade } from '../middleware/freedomValidade';

const router = Router();

router.use(proansiValidade);

/**
 * @swagger
 * /api/access/verify:
 *   post:
 *     tags:
 *       - Acessos
 *     summary: Verificar permissão de acesso
 *     description: Verifica se uma pessoa ou veículo possui permissão para acessar o condomínio.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               dispositivo:
 *                 type: string
 *               foto:
 *                 type: string
 *               sentido:
 *                 type: string
 *     responses:
 *       200:
 *         description: Permissão de acesso verificada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                   example: IDENT:... 
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
router.post('/access/verify', checkAccessPermission);

/**
 * @swagger
 * /api/access/register:
 *   post:
 *     tags:
 *       - Acessos
 *     summary: Registrar novo acesso
 *     description: Registra um novo evento de acesso ao sistema (entrada ou saída).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tipo:
 *                 type: string
 *                 enum: [entrada, saída]
 *               documento:
 *                 type: string
 *               placa:
 *                 type: string
 *     responses:
 *       201:
 *         description: Acesso registrado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                   example: IDENT:... 
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
router.post('/access/register', registerNewAccess);

/**
 * @swagger
 * /api/access/release/pedestrian:
 *   get:
 *     tags:
 *       - Acessos
 *     summary: Liberar acesso de pedestre
 *     description: Libera o acesso imediato para pedestre (por exemplo, via botão ou comando externo).
 *     deprecated: true
 *     responses:
 *       410:
 *         description: Recurso obsoleto ou removido
 */
router.get('/access/release/pedestrian', allowPedestrianAccess);

/**
 * @swagger
 * /api/access/release/vehicle:
 *   get:
 *     tags:
 *       - Acessos
 *     summary: Liberar acesso de veículo
 *     description: Libera o acesso imediato para veículos (por exemplo, via botão ou comando externo).
 *     deprecated: true
 *     responses:
 *       410:
 *         description: Recurso obsoleto ou removido
 */
router.get('/access/release/vehicle', allowvehicleAccess);

export default router;
