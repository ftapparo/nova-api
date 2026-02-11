import { Router } from 'express';
import { freedomValidate } from '../middleware/freedom-validate';
import {
    getVehicleByPlateDetailsController,
    linkVehicleTagController,
    listVehiclesByOwnerController,
    upsertVehicleByPlateController,
} from '../controllers/vehicle-v2.controller';

const router = Router();

router.use(freedomValidate);

router.get('/vehicles/owner/:personSeq', listVehiclesByOwnerController);
router.get('/vehicles/plate/:plate/details', getVehicleByPlateDetailsController);
router.post('/vehicles/upsert-by-plate', upsertVehicleByPlateController);
router.post('/vehicles/:vehicleSeq/tag', linkVehicleTagController);

export default router;
