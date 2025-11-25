const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

//  Configs
const db = require('./src/config/db');
const mqttClient = require('./src/config/mqtt');

const app = express();

// Middleware
app.use(cors()); // 모든 도메인 허용(개발용)
app.use(express.json());  // json 파싱
app.use(express.urlencoded({ extended: true }));

// Static Files (업데이트 파일 다운로드용)
// http://서버IP:port/uploads/프로젝트/버전/파일.zip 형태로 접근 가능해짐
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Route (API 연결)
// const projectRoutes = require('./src/routes/projectRoutes');
// const packageRoutes = require('./src/routes/packageRoutes');
// const commandRoutes = require('./src/routes/commandRoutes'); // 추후 구현

// app.use('/api/projects', projectRoutes);
// app.use('/api/packages', packageRoutes);
// app.use('/api/commands', commandRoutes);

// TEST
app.get('/', (req, res) => {
    res.send('JDConnect Server is Running');
});


// Server Start
const PORT = process.env.PORT || 4040;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
