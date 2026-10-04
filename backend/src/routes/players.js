import { Router } from 'express';
import * as ctrl from '../controllers/playerController.js';

const router = Router();

router.get('/', ctrl.listPlayers);
router.get('/search', ctrl.searchPlayer);          // поиск БЕЗ отслеживания
router.post('/', ctrl.addPlayer);                   // совместимый путь (сразу добавить)
router.post('/:steamId64/track', ctrl.trackPlayer); // кнопка «Отслеживать»
router.patch('/:steamId64/notify', ctrl.updateNotify); // настройки уведомлений
router.get('/:steamId64', ctrl.getPlayer);
router.delete('/:steamId64', ctrl.removePlayer);

export default router;
