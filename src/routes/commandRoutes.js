// Web -> Server -> Rpi 명령 관련 API 주소를 정의
const express = require('express');
const router = express.Router();
const commandController = require('../controllers/commandController');

// POST /api/command/update
// Body: {project_id, package_id, target_device_ids: [] or ["ALL"]}

router.post('/update', commandController.sendUpdateCommand);
router.post('/rollback', commandController.sendRollbackCommand);


module.exports = router;