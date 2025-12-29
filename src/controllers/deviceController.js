// 프론트엔드에서 보여줄 "장비 리스트 + 최신 로그" 데이터 제공
const db = require('../config/db');


exports.getProjectDevices = async (req, res) => {
    try {
        const { projectId } = req.params;

        // ★ 핵심 쿼리: Devices 테이블 + 최신 Update_Logs (LEFT JOIN)
        // 서브쿼리를 사용하여 각 장비별 가장 최신(MAX id) 로그 하나만 가져옵니다.
        const query = `
            SELECT 
                d.id, d.device_id, d.name, d.status, d.current_version, d.last_ip, d.last_connected_at,
                l.status AS last_log_status,
                l.message AS last_log_message,
                l.started_at AS last_log_time,  -- [수정] created_at -> started_at
                p.version AS target_version
            FROM devices d
            LEFT JOIN update_logs l 
                ON d.id = l.device_pk 
                AND l.id = (
                    SELECT MAX(id) 
                    FROM update_logs 
                    WHERE device_pk = d.id
                )
            LEFT JOIN packages p 
                ON l.package_id = p.id
            WHERE d.project_id = ?
            ORDER BY d.device_id ASC
        `;

        const [rows] = await db.execute(query, [projectId]);

        res.json({ success: true, list: rows });

    } catch (error) {
        console.error("Device List Error:", error);
        res.status(500).json({ success: false, message: "장비 목록 조회 실패" });
    }
}