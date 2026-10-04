import { Router } from 'express';
import * as ctrl from '../controllers/serverController.js';

const router = Router();

router.get('/', ctrl.listServers);
router.post('/', ctrl.addServer);
router.post('/:id/scan', ctrl.rescanServer);
router.delete('/:id', ctrl.deleteServer);

export default router;
