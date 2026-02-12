import { Router } from 'express';
import { getUserSettingsControl, upsertUserSettingsControl } from '../controllers/user-settings.controller';

const router = Router();

router.get('/user-settings/:user', getUserSettingsControl);
router.put('/user-settings/:user', upsertUserSettingsControl);

export default router;
