import express from 'express';
import {
    cieAlarmsActiveGateway,
    cieBlockCountersGateway,
    cieCommandAlarmGeneralGateway,
    cieCommandBlockGateway,
    cieCommandBrigadeSirenGateway,
    cieCommandDelaySirenGateway,
    cieCommandOutputGateway,
    cieCommandReleaseGateway,
    cieCommandRestartGateway,
    cieCommandSilenceBipGateway,
    cieCommandSilenceGateway,
    cieCommandSilenceSirenGateway,
    cieLogsGateway,
    cieOutputCountersGateway,
    ciePanelGateway,
    cieStatusGateway,
} from '../controllers/cie-gateway.controller';

const router = express.Router();

router.get('/cie/panel', ciePanelGateway);
router.get('/cie/status', cieStatusGateway);
router.get('/cie/alarms/active', cieAlarmsActiveGateway);
router.get('/cie/logs', cieLogsGateway);
router.get('/cie/counters/blocks', cieBlockCountersGateway);
router.get('/cie/counters/outputs', cieOutputCountersGateway);

router.post('/cie/commands/silence-bip', cieCommandSilenceBipGateway);
router.post('/cie/commands/alarm-general', cieCommandAlarmGeneralGateway);
router.post('/cie/commands/silence-siren', cieCommandSilenceSirenGateway);
router.post('/cie/commands/restart', cieCommandRestartGateway);

router.post('/cie/commands/silence', cieCommandSilenceGateway);
router.post('/cie/commands/release', cieCommandReleaseGateway);
router.post('/cie/commands/brigade-siren', cieCommandBrigadeSirenGateway);
router.post('/cie/commands/delay-siren', cieCommandDelaySirenGateway);
router.post('/cie/commands/block', cieCommandBlockGateway);
router.post('/cie/commands/output', cieCommandOutputGateway);

export default router;

