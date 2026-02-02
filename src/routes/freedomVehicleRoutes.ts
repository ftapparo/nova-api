// src/routes/freedomVehicleRoutes.ts
import { Router } from 'express';
import {
  getVehicleList,
  getVehicle,
  setVehicle,
  updateVehicleImage,
  updateVehicleAccess,
  lockVehicle,
  unlockVehicle,
  purgeVehicle,
} from '../controllers/freedomController';
import { proansiValidade } from '../middleware/freedomValidade';
import multer from 'multer';

const router = Router();
const upload = multer();

router.use(proansiValidade);

/**
 * @swagger
 * /api/vehicles:
 *   get:
 *     tags:
 *       - Veículos
 *     summary: Listar veículos
 *     description: Retorna todos os veículos cadastrados no sistema.
 *     responses:
 *       200:
 *         description: Lista de veículos retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: object
 *                   items:
 *                     type: object
 *                 success:
 *                   type: boolean
 *                 errorMessage:
 *                   type: string
 *                   nullable: true
 *                 errors:
 *                   type: string
 *                   nullable: true
 */
router.get('/vehicles', getVehicleList);

/**
 * @swagger
 * /api/vehicles/{id}:
 *   get:
 *     tags:
 *       - Veículos
 *     summary: Obter veículo
 *     description: Retorna os dados de um veículo específico pelo ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do veículo
 *     responses:
 *       200:
 *         description: Dados do veículo retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: object
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
router.get('/vehicles/:id', getVehicle);

/**
 * @swagger
 * /api/vehicles:
 *   post:
 *     tags:
 *       - Veículos
 *     summary: Cadastrar veículo
 *     description: Cria um novo veículo no sistema.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plate
 *               - brand
 *               - model
 *               - color
 *               - user_seq
 *               - unit_seq
 *               - tag
 *             properties:
 *               plate:
 *                 type: string
 *               brand:
 *                 type: string
 *               model:
 *                 type: string
 *               color:
 *                 type: string
 *               user_seq:
 *                 type: integer
 *               unit_seq:
 *                 type: integer
 *               tag:
 *                 type: string
 *     responses:
 *       201:
 *         description: Veículo cadastrado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: object
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
router.post('/vehicles', setVehicle);

/**
 * @swagger
 * /api/vehicles/{id}/photo:
 *   put:
 *     tags:
 *       - Veículos
 *     summary: Atualizar imagem do veículo
 *     description: Atualiza a imagem do veículo. Requer pelo menos uma das imagens.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photoTag:
 *                 type: string
 *                 format: binary
 *               photoVehicle:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Imagem atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: object
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
router.put(  '/vehicles/:id/photo', upload.any(), updateVehicleImage);

/**
 * @swagger
 * /api/vehicles/{id}/access:
 *   put:
 *     tags:
 *       - Veículos
 *     summary: Atualizar acesso do veículo
 *     description: Atualiza as informações de acesso do veículo.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - personSequence
 *               - id2
 *               - user
 *               - vehicleSequence
 *             properties:
 *               personSequence:
 *                 type: integer
 *               type:
 *                 type: string
 *                 example: Y
 *               panic:
 *                 type: string
 *                 example: N
 *               id2:
 *                 type: string
 *                 example: 0005629999
 *               useType:
 *                 type: string
 *                 example: N
 *               user:
 *                 type: string
 *                 example: JONH
 *               vehicleSequence:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Acesso atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: object
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
router.put('/vehicles/:id/access', updateVehicleAccess);

/**
 * @swagger
 * /api/vehicles/{id}/lock:
 *   put:
 *     tags:
 *       - Veículos
 *     summary: Bloquear veículo
 *     description: Bloqueia o acesso do veículo no sistema.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do veículo
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Veículo bloqueado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: object
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
router.put('/vehicles/:id/lock', lockVehicle);

/**
 * @swagger
 * /api/vehicles/{id}/unlock:
 *   put:
 *     tags:
 *       - Veículos
 *     summary: Desbloquear veículo
 *     description: Desbloqueia o acesso do veículo no sistema.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do veículo
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Veículo desbloqueado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: object
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
router.put('/vehicles/:id/unlock', unlockVehicle);

/**
 * @swagger
 * /api/vehicles/purge/{period}:
 *   put:
 *     tags:
 *       - Veículos
 *     summary: Bloquear veículo
 *     description: Bloqueia o acesso de veículos com base no periodo determinado.
 *     parameters:
 *       - in: path
 *         name: period
 *         required: true
 *         description: Período em dias
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Veículos bloqueados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: object
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
router.put('/vehicles/purge/:period', purgeVehicle);

export default router;
