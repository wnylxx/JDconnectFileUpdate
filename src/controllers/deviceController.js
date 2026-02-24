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