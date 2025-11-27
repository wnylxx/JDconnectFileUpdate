// multer를 설정하여 파일을 임시로 받고, 컨트롤러로 넘기는 역할 (접수처)
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const packageController = require('../controllers/packageController');

// 1. Multer 저장 설정 (임시 저장소)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 일단 'uploads/temp/raw'에 원본 상태로 저장
        const uploadPath = path.join(__dirname, '../../uploads/temp/raw');
        const fs = require('fs-extra');
        fs.ensureDirSync(uploadPath); // 폴더가 없으면 생성
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // 파일명 깨짐 방지를 위해 원본 이름 그대로 사용
        // (한글 파일명은 utf-8 처리가 필요할 수 있음)
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// 2. 라우트 정의
// POST /api/packages
// files: 다중 파일, map_data: JSON 문자열, project_id, version
router.post('/', upload.array('files'), packageController.createPackage);

module.exports = router;