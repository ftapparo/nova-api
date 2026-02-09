import express from 'express';
import { listDoorsControl, listGatesControl, openDoorControl, openGateControl, restartGateControl, statusGatesAndDoorsControl, listAccessCache } from '../controllers/control.controller';

const router = express.Router();

// Rota de status dos portões e portas
router.get('/control/status', statusGatesAndDoorsControl);

// Rota para abrir o portão veicular
router.post('/control/gate/open', openGateControl);

// Rota para abrir a porta
router.post('/control/door/open', openDoorControl);

// Rota para listar portas disponíveis
router.get('/control/door/list', listDoorsControl);

// Rota para listar portões disponíveis
router.get('/control/gate/list', listGatesControl);

// Reiniciar controle de portões (gateway para mesma rota em TAG)
router.post('/control/gate/restart', restartGateControl);

// Rota para listar últimos acessos do cache da TAG (portões)
router.get('/control/gate/access/list', listAccessCache);


export default router;
