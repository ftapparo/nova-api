import { Router } from 'express';
import { freedomValidate } from '../middleware/freedom-validate';
import { getExaustorStatusController, turnOffExaustorController, turnOnExaustorController } from '../controllers/exaustor.controller';

const router = Router();

router.use(freedomValidate);

// Rotas para controle dos exaustores
router.post('/exaustores/on', turnOnExaustorController);

// Desliga o exaustor especificado no body
router.post('/exaustores/off', turnOffExaustorController);

// Obtém o status geral dos módulos e memória de acionamentos
router.get('/exaustores/status', getExaustorStatusController);

export default router;
