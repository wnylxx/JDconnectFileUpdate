const db = require('../config/db');

// 모든 프로젝트 목록 조회 (사이드바)
exports.getAllProjects = async (req, res) => {
    try {
        // id와 name 만 가져옴
        const query = 'SELECT id, name FROM projects ORDER BY id ASC';
        const [row] = await db.execute(query);

        res.json({success: true, list: rows});
    } catch (error) {
        console.error("Project List Error:", error);
        res.status(500).json({success: false, message: "프로젝트 목록 조회 실패"});
    }
};