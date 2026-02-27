// 프론트엔드에서 보여줄 "장비 리스트 + 최신 로그" 데이터 제공
const db = require('../config/db');


exports.getProjectDevices = async (req, res) => {
    try {
        const { projectId } = req.params;

        const query = `
            SELECT
                id,
                project_id,
                name,
                current_version,
                backup_version,
                status,
                last_connected_at
            FROM devices
            WHERE project_id = ?
            ORDER BY id ASC
        `;

        const [rows] = await db.execute(query, [projectId]);

        res.json({ success: true, list: rows });

    } catch (error) {
        console.error("Device List Error:", error);
        res.status(500).json({ success: false, message: "장비 목록 조회 실패" });
    }
}

exports.checkInDevice = async (req, res) => {
    try {
        const { project_id, name, current_version } = req.body;

        // 1. DB에 해당 이름의 기기가 있는지 검색
        const [rows] = await db.execute(
            'SELECT id FROM devices WHERE project_id = ? AND name = ?',
            [project_id, name]
        );

        let deviceId;

        if (rows.length > 0) {
            // 2. 이미 존재하는 기기면 ID 가져오고 상태/버전 업데이트
            deviceId = rows[0].id;
            await db.execute(
                'UPDATE devices SET status = ?, current_version = ?, last_connected_at = NOW() WHERE id = ?',
                ['connected', current_version, deviceId]
            );
        } else {
            // 3. 없는 기기면 새로 INSERT 하고 생성된 ID 가져오기
            const [result] = await db.execute(
                'INSERT INTO devices (project_id, name, current_version, status, last_connected_at) VALUES (?, ?, ?, ?, NOW())',
                [project_id, name, current_version, 'connected']
            );
            deviceId = result.insertId;
        }

        // RPi에게 DB PK(id) 응답
        res.json({ success: true, data: { id: deviceId } });
    } catch (error) {
        console.error("Check-in Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
}