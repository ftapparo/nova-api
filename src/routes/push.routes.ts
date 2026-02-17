import { Router } from 'express';
import {
    pushFireAlarmEventController,
    pushPublicKeyController,
    pushSendController,
    pushSubscribeController,
    pushUnsubscribeController,
} from '../controllers/push.controller';

const router = Router();

router.get('/push/public-key', pushPublicKeyController);
router.post('/push/subscriptions', pushSubscribeController);
router.delete('/push/subscriptions', pushUnsubscribeController);
router.post('/push/send', pushSendController);
router.post('/push/events/fire-alarm', pushFireAlarmEventController);

export default router;
