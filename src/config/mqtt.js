const mqtt = require('mqtt');
const db = require('./db'); // DB 연결 가져오기
require('dotenv').config();

const client = mqtt.connect(process.env.MQTT_HOST);

client.on('connect', () => {
    console.log('Connected to MQTT Broker');

    // RPi들의 상태 보고(status)와 로그(log)를 구독합니다.
    // 토픽: status/프로젝트ID/장비ID, log/프로젝트ID/장비ID
    client.subscribe('status/+/+');
    client.subscribe('log/+/+');
});

client.on('message', async (topic, message) => {
    try {
        const msgString = message.toString();
        // topic: status(or log)/projectId/deviceId
        const topicParts = topic.split('/');
        const type = topicParts[0];           // status or log
        const projectId = topicParts[1];
        const deviceId = topicParts[2];

        const payload = JSON.parse(msgString);

        if (type === 'status') {
            // payload 예시: { device_id: "002", status: "connected", current_version: "0.0.1", ip: "192.111.111.11"}
            console.log(`Status Report from [${deviceId}]: ${payload.status}`);

            // 1. DB에 deviceId 장비가 존재하는 지 확인
            const [rows] = await db.execute(
                'SELECT id FROM devices WHERE device_id = ?',
                [deviceId]
            );

            if (rows.length === 0) {
                // [신규 장비] DB에 없으면 자동 등록
                console.log(`New Device Detected! Registering ${deviceId}...`);

                // 반드시! projectId가 DB projects 테이블에 존재해야함!
                await db.execute(
                    `INSERT INTO devices (project_id, device_id, name, current_version, status, last_ip, last_connected_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                    [projectId, deviceId, `Device-${deviceId}`, payload.current_version, payload.status, payload.ip]
                );

            } else {
                // [기존 장비] 정보 갱신 (IP, 접속 시간, 버전)
                // 'connected' 신호가 오면 최소한 last_connected_at은 갱신
                // 기존 장비가 접속 될 때 connected로 변경하면 발생할 수 있는 문제점
                //  - 업데이트가 실패했을 경우, Rpi가 재부팅 될 경우 connected 상태만 보고 업데이트 성공 상태로 착각 할 수 있음
                //     -> 즉, 업데이트 확인은 버전 정보와 로그를 확인 해야함!!
                await db.execute(
                    `UPDATE devices 
                    SET last_ip = ?, 
                        last_connected_at = NOW(), 
                        current_version = ?,
                        status = ?
                    WHERE device_id = ?`,
                    [payload.ip, payload.current_version, payload.status, deviceId] // 보통 connected 가 들어올 예정
                );
                console.log(`Device [${deviceId}] status updated to: ${payload.status} (v${payload.current_version})`);
            }
        } else if (type === 'log') {
            // TODO: 로그 처리 (step 4 예정)
        }

    } catch (error) {
        console.error('MQTT Message Error:', error);
    }
});

client.on('error', (err) => {
    console.error('MQTT Error: ', err);
});

module.exports = client;