import { Router } from 'express';
import { freedomValidate } from '../middleware/freedom-validate';
import { configureExaustorController, getExaustorProcessStatusController, getExaustorStatusController, turnOffExaustorController, turnOnExaustorController } from '../controllers/exaustor.controller';

const router = Router();

router.use(freedomValidate);

// Rotas para controle dos exaustores
router.post('/exaustors/on', turnOnExaustorController);

// Desliga o exaustor especificado no body
router.post('/exaustors/off', turnOffExaustorController);

// Obtém o status geral dos módulos e memória de acionamentos (id opcional)
router.get('/exaustors/status/:id?', getExaustorStatusController);

// Obtém o status do processo de memória dos relés
router.get('/exaustors/process/status', getExaustorProcessStatusController);

// Configura módulos via backlog
router.post('/exaustors/config', configureExaustorController);

export default router;
