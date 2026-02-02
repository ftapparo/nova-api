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

router.post('/access/verify', checkAccessPermission);

router.post('/access/register', registerNewAccess);

router.get('/access/release/pedestrian', allowPedestrianAccess);

router.get('/access/release/vehicle', allowvehicleAccess);

export default router;
