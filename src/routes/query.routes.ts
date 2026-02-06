import { Router } from 'express';
import { freedomValidate } from '../middleware/freedom-validate';
import { queryCpf, queryPlate, queryTag } from '../controllers/query.controller';

const router = Router();

router.use(freedomValidate);

// Rotas de consultas (CPF, placa e tag)
router.get('/queries/cpf/:cpf', queryCpf);
router.get('/queries/plate/:plate', queryPlate);
router.get('/queries/tag/:tag', queryTag);

export default router;
