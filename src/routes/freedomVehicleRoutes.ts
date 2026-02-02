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

router.get('/vehicles', getVehicleList);

router.get('/vehicles/:id', getVehicle);

router.post('/vehicles', setVehicle);

router.put(  '/vehicles/:id/photo', upload.any(), updateVehicleImage);

router.put('/vehicles/:id/access', updateVehicleAccess);

router.put('/vehicles/:id/lock', lockVehicle);

router.put('/vehicles/:id/unlock', unlockVehicle);

router.put('/vehicles/purge/:period', purgeVehicle);

export default router;
