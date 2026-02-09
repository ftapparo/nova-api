import { Router } from 'express';
import { checkAccessPermission, registerNewAccess, allowPedestrianAccess, allowvehicleAccess, listAccess } from '../controllers/freedom.controller';
import { freedomValidate } from '../middleware/freedom-validate';

const router = Router();

router.use(freedomValidate);

// Rotas de controle de acesso
router.get('/access/verify', checkAccessPermission);

// Rota para listar últimos acessos por dispositivo
router.get('/access/list', listAccess);

// Rota para registrar novo acesso
router.post('/access/register', registerNewAccess);

// Rotas para liberar acesso
router.post('/access/release/pedestrian', allowPedestrianAccess);

// Rota para liberar acesso de veículo
router.post('/access/release/vehicle', allowvehicleAccess);

export default router;
