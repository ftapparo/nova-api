import { Router } from 'express';
import { checkAccessPermission, registerNewAccess, allowPedestrianAccess, allowvehicleAccess } from '../controllers/freedom.controller';
import { freedomValidate } from '../middleware/freedom-validate';

const router = Router();

router.use(freedomValidate);

// Rotas de controle de acesso
router.post('/access/verify', checkAccessPermission);

// Rota para registrar novo acesso
router.post('/access/register', registerNewAccess);

// Rotas para liberar acesso
router.get('/access/release/pedestrian', allowPedestrianAccess);

// Rota para liberar acesso de veículo
router.get('/access/release/vehicle', allowvehicleAccess);

export default router;
