const express = require('express');
const router = express.Router();
const dveiceController = require('../controllers/deviceController');

router.get('/:projectId', dveiceController.getProjectDevices);

module.exports = router;