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
             [project_id, version, downloadUrl, 'One-Shot Upload']
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




exports.createPackage = async (req, res) => {
    // 임시 작업 공간 경로 변수 (에러 발생 시 삭제를 위해 밖에서 선언)
    let tempWorkDir = null;

    try {
        const { project_id, version, map_data } = req.body;
        const files = req.files;

        // 1. 유효성 검사
        if (!files || files.length === 0) {
            return res.status(400).json({ success: false, message: "파일이 업로드되지 않았습니다." });        
        }
        if (!map_data) {
            return res.status(400).json({ success: false, message: "파일 매핑 정보(map_data)가 없습니다." });
        }

        // map_data 파싱 (JSON 문자열 -> 객체 배열)
        let mapping;
        try {
            mapping = JSON.parse(map_data);
        } catch (e) {
            return res.status(400).json({ success: false, message: "map_data 형식이 올바르지 않습니다." });
        }

        console.log(`[Package Create] Project: ${project_id}, Version: ${version}`);

        // 2. 임시 작업 공간 생성 (충돌 방지를 위해 UUID 사용)
        const uniqueId = uuidv4();
        tempWorkDir = path.join(__dirname, '../../uploads/temp', uniqueId);
        await fs.ensureDir(tempWorkDir);

        // 3. 파일 재배치 (Restructuring)
        // 업로드된 파일들을 map_data에 적힌 targetPath에 맞춰 tempWorkDir 안으로 이동
        for (const file of files) {
            // 해당 파일의 매핑 정보 찾기
            const mapInfo = mapping.find(m => m.fileName === file.originalname);

            // 매핑 정보가 없으면 루트('/')로 간주
            const targetSubpath = mapInfo ? mapInfo.targetPath : '';

            // 최종 이동할 경로 계산: tempWorkDir + targetPath + fileName
            const destpath = path.join(tempWorkDir, targetSubpath, file.originalname);

            // 이동 (move는 폴더가 없으면 자동 생성해줌)
            await fs.move(file.path, destpath, { overwrite: true});
        }

        // 4. 최종 저장 경로 설정 및 압축
        // 저장 경로: uploads/projects/{project_id}/{version}/update.zip
        const finalDistDir = path.join(__dirname, `../../uploads/projects/${project_id}/${version}`);
        await fs.ensureDir(finalDistDir);

        const zipFileName = `update_v${version}.zip`;
        const finalZipPath = path.join(finalDistDir, zipFileName);

        // 압축 수행
        await fileUtils.compressFolder(tempWorkDir, finalZipPath);

        // 5. DB 저장
        // 다운로드 URL 생성 (Static 미들웨어 경로 기준)
        // 예: http://localhost:3000/uploads/projects/1/1.0.5/update_v1.0.5.zip
        // 주의: 도메인/IP는 클라이언트가 붙이거나 환경변수 처리. 여기선 상대 경로 저장.

        const downloadUrl = `/uploads/projects/${project_id}/${version}/${zipFileName}`;

        const query = `
            INSERT INTO packages (project_id, version, file_path, description)
            VALUE(?, ?, ?, ?)
        `;

        // description은 일단 'Auto Created'로 넣거나 req.body에서 받음
        await db.execute(query, [project_id, version, downloadUrl, 'Web uploaded']);

        // 6.  성공 응답
        res.status(201).json({
            success: true,
            message: "패키지 생성 완료",
            data: {
                project_id,
                version,
                download_url: downloadUrl
            }
        });

    
    } catch (error) {
        console.error("Package Creation Error:", error);

        // 에러 시 중복 키 체크
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: "이미 존재하는 버전입니다." });
        }

        res.status(500).json({ success: false, message: "서버 내부 오류 발생", error: error.message });

    } finally {
        // 7. 뒤처리 (임시 폴더 삭제)
        if (tempWorkDir) {
            await fileUtils.removeFolder(tempWorkDir);
            // multer가 남긴 raw 폴더 내의 파일들도 혹시 이동 안된게 있으면 정리 필요할 수 있음

        }
    }
}