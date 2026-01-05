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
                    [projectId, deviceId, payload.name || `Device-${deviceId}`, payload.current_version, payload.status, payload.ip]
                );

            } else {
                // [기존 장비] 정보 갱신 (IP, 접속 시간, 버전)
                // 'connected' 신호가 오면 최소한 last_connected_at은 갱신
                // 기존 장비가 접속 될 때 connected로 변경하면 발생할 수 있는 문제점
                //  - 업데이트가 실패했을 경우, Rpi가 재부팅 될 경우 connected 상태만 보고 업데이트 성공 상태로 착각 할 수 있음
                //     -> 즉, 업데이트 확인은 버전 정보와 로그를 확인 해야함!!

                // disconnect 일 때 version이랑 ip 는 그대로 놔두기!
                if (payload.status === 'connected') {
                    await db.execute(
                        `UPDATE devices 
                         SET last_ip = ?, 
                             current_version = ?,
                             status = ?,
                             name = ?,
                             last_connected_at = NOW()
                         WHERE device_id = ?`,
                         [
                            payload.ip, payload.current_version, payload.status, payload.name || `Device-${deviceId}`,deviceId
                         ]
                    )
                } else {
                    // disconnect 될 경우
                    await db.execute(
                        `UPDATE devices 
                         SET status = ?,
                             last_connected_at = NOW() 
                         WHERE device_id = ?`,
                        [
                            payload.status, 
                            deviceId
                        ]
                    );
                }

            }
        } else if (type === 'log') {
            // payload: { device_id, status: 'success'/'fail', message, package_id }
            console.log(`Log from [${deviceId}]: ${payload.status} - ${payload.message}`);
            
            // DB에 로그 '추가' (History 보존을 위해 INSERT 권장)
            // device_code(deviceId)로 device_pk(id)를 찾아야 함
            const [devRows] = await db.execute('SELECT id FROM devices WHERE device_id = ?', [deviceId]);
            
            if (devRows.length > 0) {
                const devicePk = devRows[0].id;
                
                // package_id가 없는 경우(일반 로그)를 대비해 null 처리
                const pkgId = payload.package_id || null;

                await db.execute(
                    // [수정] created_at -> started_at
                    `INSERT INTO update_logs (device_pk, package_id, command_type, status, message, started_at)
                     VALUES (?, ?, 'log_report', ?, ?, NOW())`,
                    [devicePk, pkgId, payload.status, payload.message]
                );
            }
        }

    } catch (error) {
        console.error('MQTT Message Error:', error);
    }
});

client.on('error', (err) => {
    console.error('MQTT Error: ', err);
});

module.exports = client;