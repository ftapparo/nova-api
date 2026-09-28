import { Router } from 'express';
import { listCommandLogsController } from '../controllers/command-log.controller';

const router = Router();

router.get('/commands/logs', listCommandLogsController);

export default router;
