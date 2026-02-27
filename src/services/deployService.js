// 배포 시스템 (공통)
// req, res 를 모르는 상태, 데이터를 받아서 DB에 수정하고 MQTT를 쏘는 일 담당

/**
 * 배포 수행 공통 함수
 * @param {number} projectId - 프로젝트 ID
 * @param {number} packageId - 패키지 ID
 * @param {string} version - 버전
 * @param {string} downloadUrl - 다운로드 경로
 * @param {Array} targetDeviceIds - 대상 장비 device_id 목록 (문자열 배열)
 */

const db = require('../config/db'); 
const mqttClient = require('../config/mqtt');


exports.deployPackageToDevices = async(projectId, packageId, version, downloadUrl, targetDeviceIds) => {
    let deployedCount = 0;

    // 1. "ALL" 처리
    let finalTargetList = [];
    if (targetDeviceIds.includes("ALL")) {
        const [devices] = await db.execute('SELECT id FROM devices WHERE project_id = ?', [projectId]);
        finalTargetList = devices.map(d => d.id);
    } else {
        finalTargetList = targetDeviceIds;
    }

    if (finalTargetList.length === 0) return 0;

    console.log(`Deploy Service: Sending v${version} to ${finalTargetList.length} devices.`);

    // 2. 병렬 처리로 배포 수행
    const tasks = finalTargetList.map(async (devicePkId) => {
        try {
            // 2-1. DB PK 조회 (update_logs에는 PK가 필요하므로) =>  삭제 (PK 찾을 필요 없어짐)
  
            // 2-2. 상태 변경 (Updating)
            await db.execute("UPDATE devices SET status = 'updating' WHERE id = ?", [devicePkId]);

            // 2-3. 로그 기록 (Pending) -- 로그 기록 방식 바뀜
            // await db.execute(
            //     `INSERT INTO update_logs (device_pk, package_id, command_type, status, message, started_at) 
            //      VALUES (?, ?, 'update', 'pending', 'Command Sent', NOW())`,
            //     [devicePk, packageId]
            // );

            // 2-4. MQTT 전송
            const topic = `cmd/${projectId}/${devicePkId}`;
            const payload = JSON.stringify({
                command: "UPDATE",
                version: version,
                download_url: downloadUrl,
                package_id: packageId,
                timestamp: new Date().toISOString()
            });

            mqttClient.publish(topic, payload, { qos: 1 });
            deployedCount++;

        } catch (err) {
            console.error(`Deploy Error for ${devicePkId}:`, err.message);
        }
    });

    await Promise.all(tasks);
    return deployedCount;
};