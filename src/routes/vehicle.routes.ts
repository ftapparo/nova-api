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
} from '../controllers/freedom.controller';
import { freedomValidate } from '../middleware/freedom-validate';
import multer from 'multer';

const router = Router();
const upload = multer();

router.use(freedomValidate);

// Rotas de controle de veículos
router.get('/vehicles', getVehicleList);

// Rota para obter detalhes de um veículo específico
router.get('/vehicles/:id', getVehicle);

// Rota para registrar um novo veículo
router.post('/vehicles', setVehicle);

// Rota para atualizar a imagem de um veículo
router.put('/vehicles/:id/photo', upload.any(), updateVehicleImage);

// Rota para atualizar o acesso de um veículo
router.patch('/vehicles/:id/access', updateVehicleAccess);

// Rota para bloquear um veículo
router.put('/vehicles/:id/lock', lockVehicle);

// Rota para desbloquear um veículo
router.put('/vehicles/:id/unlock', unlockVehicle);

// Rota para purgar veículos com base em um período
router.post('/vehicles/purge', purgeVehicle);

export default router;
