const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');


router.post('/check-in', deviceController.checkInDevice);
router.get('/:projectId', deviceController.getProjectDevices);

module.exports = router;