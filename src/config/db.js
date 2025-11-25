const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,  // 추후 값 변경 예정
    queueLimit: 0
});

// promise 기반으로 async/await 사용하기
const promisePool = pool.promise();

console.log('DB Pool Created');

module.exports = promisePool;