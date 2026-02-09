import { Router } from 'express';
import { freedomValidate } from '../middleware/freedom-validate';
import { configureExhaustController, getExhaustProcessStatusController, getExhaustStatusController, turnOffExhaustController, turnOnExhaustController } from '../controllers/exhaust.controller';

const router = Router();

router.use(freedomValidate);

// Rotas para controle dos exaustores
router.post('/exhausts/on', turnOnExhaustController);

// Desliga o exaustor especificado no body
router.post('/exhausts/off', turnOffExhaustController);

// Obtém o status geral dos módulos e memória de acionamentos (id opcional)
router.get('/exhausts/status/:id?', getExhaustStatusController);

// Obtém o status do processo de memória dos relés
router.get('/exhausts/process/status', getExhaustProcessStatusController);

// Configura módulos via backlog
router.post('/exhausts/config', configureExhaustController);

export default router;
