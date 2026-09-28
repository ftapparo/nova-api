import { Router } from 'express';
import { checkAccessPermission, registerNewAccess, allowPedestrianAccess, allowvehicleAccess, listAccess } from '../controllers/freedom.controller';
import { freedomValidate } from '../middleware/freedom-validate';

const router = Router();

router.use(freedomValidate);

// Valida permissão de acesso (TAG, ID, CPF ou PLACA)
router.get('/access/verify', checkAccessPermission);

// Rota para listar últimos acessos por dispositivo
router.get('/access/list', listAccess);

// Rota para registrar novo acesso
router.post('/access/register', registerNewAccess);


export default router;
