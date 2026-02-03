import { Router } from 'express';
import { freedomValidate } from '../middleware/freedom-validate';
import { getExaustorStatusController, turnOffExaustorController, turnOnExaustorController } from '../controllers/exaustor.controller';

const router = Router();

router.use(freedomValidate);

// Rotas para controle dos exaustores
router.post('/exaustores/:id/on', turnOnExaustorController);

// Desliga o exaustor especificado pelo ID
router.post('/exaustores/:id/off', turnOffExaustorController);

// Obtém o status do exaustor especificado pelo ID
router.get('/exaustores/:id/status', getExaustorStatusController);

export default router;
