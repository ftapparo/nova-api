import { Router } from 'express';
import { freedomValidate } from '../middleware/freedom-validate';
import { configureExaustorController, getExaustorProcessStatusController, getExaustorStatusController, turnOffExaustorController, turnOnExaustorController } from '../controllers/exaustor.controller';

const router = Router();

router.use(freedomValidate);

// Rotas para controle dos exaustores
router.post('/exaustores/on', turnOnExaustorController);

// Desliga o exaustor especificado no body
router.post('/exaustores/off', turnOffExaustorController);

// Obtém o status geral dos módulos e memória de acionamentos (id opcional)
router.get('/exaustores/status/:id?', getExaustorStatusController);

// Obtém o status do processo de memória dos relés
router.get('/exaustores/process/status', getExaustorProcessStatusController);

// Configura módulos via backlog
router.post('/exaustores/config', configureExaustorController);

export default router;
