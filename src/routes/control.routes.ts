import express from 'express';
import { listDoorsControl, listGatesControl, openDoorControl, openGateControl } from '../controllers/control.controller';

const router = express.Router();

// Rota para abrir o portão veicular
router.post('/control/gate/open', openGateControl);

// Rota para abrir a porta
router.post('/control/door/open', openDoorControl);

// Rota para listar portas disponíveis
router.get('/control/door/list', listDoorsControl);

// Rota para listar portões disponíveis
router.get('/control/gate/list', listGatesControl);

export default router;
