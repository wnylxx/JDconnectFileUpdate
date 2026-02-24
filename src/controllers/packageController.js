// 업로드된 파일들을 map_data에 맞게 재배치하고, 압축한 뒤 DB에 저장하는 로직

const db = require('../config/db');
const fileUtils = require('../utils/fileUtils');
const path = require('path');
const fs = require('fs-extra');
const uuid = require('uuid');
const { default: mqtt, MqttClient } = require('mqtt');
const uuidv4 = uuid.v4;

const deployService = require('../services/deployService');


// 서버에 파일 업로드 및 배포 (one shot)
exports.createPackageAndDeploy = async (req, res) => {
    let tempWorkDir = null;

    try {
        // multipart/form-data로 오기 때문에 target_device_ids는 문자열일 수 있음 -> 파싱 필요
        let { project_id, version, map_data, target_device_ids} = req.body;
        const files = req.files;
        
        // -- 기존 업로드 및 패키징 로직 유지 --
        // 1. 유효성 검사
        if (!files || files.length === 0) {
            return res.status(400).json({ success: false, message: "파일이 업로드되지 않았습니다." });        
        }
        if (!map_data) {
            return res.status(400).json({ success: false, message: "파일 매핑 정보(map_data)가 없습니다." });
        }

        const [exists] = await db.execute(
            'SELECT 1 FROM packages WHERE project_id = ? AND version = ?',
            [project_id, version]
        );
        
        if (exists.length > 0) {
            // 이미 존재하면 즉시 에러 리턴 (파일 작업 안 함)
            return res.status(409).json({ 
                success: false, 
                message: `버전 v${version}은(는) 이미 존재합니다. 버전을 올려주세요.` 
            });
        }
        
        // map_data 파싱 (JSON 문자열 -> 객체 배열)
        let mapping;
        try {
            mapping = JSON.parse(map_data);
        } catch (e) {
            return res.status(400).json({ success: false, message: "map_data 형식이 올바르지 않습니다." });
        }

        // target_device_ids 파싱 (JSON 문자열로 올 경우 대비)
        let targetDevices = [];

        if (target_device_ids) {
            try {
                targetDevices = typeof target_device_ids === 'string' ? JSON.parse(target_device_ids) : target_device_ids;
            } catch (e) {
                targetDevices = []; // 파싱 실패 시 빈 배열
            }
        }

        // 2. 임시 작업 공간 생성 (충돌 방지를 위해 UUID 사용)
        const uniqueId = uuidv4();
        tempWorkDir = path.join(__dirname, '../../uploads/temp', uniqueId);
        await fs.ensureDir(tempWorkDir);

        // 3. 파일 재배치 (Restructuring)
        // 업로드된 파일들을 map_data에 적힌 targetPath에 맞춰 tempWorkDir 안으로 이동
        for (const file of files) {
            const mapInfo = mapping.find(m => m.fileName === file.originalname);
            const targetSubPath = mapInfo ? mapInfo.targetPath : '';
            const destPath = path.join(tempWorkDir, targetSubPath, file.originalname);
            await fs.move(file.path, destPath, { overwrite: true });
        }

        // 4. 최종 저장 경로 설정 및 압축
        // 저장 경로: uploads/projects/{project_id}/{version}/update.zip  (상대주소!!)
        const finalDistDir = path.join(__dirname, `../../uploads/projects/${project_id}/${version}`);
        await fs.ensureDir(finalDistDir);
        const zipFileName = `update_v${version}.zip`;
        const finalZipPath = path.join(finalDistDir, zipFileName);

        await fileUtils.compressFolder(tempWorkDir, finalZipPath);

        const downloadUrl = `/uploads/projects/${project_id}/${version}/${zipFileName}`;

        // DB 저장 (패키지 등록)
        const [result] = await db.execute(
            `INSERT INTO packages (project_id, version, file_path, description)
             VALUES (?, ?, ?, ?)`,
             [project_id, version, downloadUrl, '파일 업로드 및 배포 명령 전달']
        );

        const newPackageId = result.insertId; // 방금 넣은 행의 id 값을 받아오는 메서드
        
        // --- [추가된 부분: 즉시 배포 로직] ---
        let deployCount = 0;

        if ( targetDevices.length > 0 ) {
            console.log(`[PKCTL] Deploying Package ID ${newPackageId} to ${targetDevices.length} devices...`);

            deployCount = await deployService.deployPackageToDevices(
                project_id, 
                newPackageId, 
                version, 
                downloadUrl, 
                targetDevices
            );
        }

        // 응답
        res.status(201).json({
            success: true,
            message: `패키지 생성 및 ${deployCount}대 장비 배포 완료`,
            data: { 
                package_id: newPackageId, 
                version, 
                deployed_count: deployCount 
            }
        });
    } catch (error) {
        console.error("Process Error:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (tempWorkDir) await fileUtils.removeFolder(tempWorkDir);
    }
    
}
