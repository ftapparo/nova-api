import { Router } from 'express';
import { freedomValidate } from '../middleware/freedom-validate';
import { queryCpf, queryPlate, queryTag } from '../controllers/query.controller';

const router = Router();

router.use(freedomValidate);

// Rotas de consulta de CPF
router.get('/queries/cpf/:cpf', queryCpf);

// Rota de consulta de PLACA
router.get('/queries/plate/:plate', queryPlate);

// Rota de consulta de TAG
router.get('/queries/tag/:tag', queryTag);

export default router;
