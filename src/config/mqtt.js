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
        const devicePkId = topicParts[2];

        const payload = JSON.parse(msgString);

        if (type === 'status') {
            console.log(`Status Report from [${devicePkId}]: ${payload.status}`);

            // 신규 등록은 HTTP API(/check-in)에서 이미 담당하므로, 여기서는 무조건 UPDATE만 수행합니다.
            if (payload.status === 'connected') {
                await db.execute(
                    `UPDATE devices 
                     SET current_version = ?, 
                         backup_version = ?, /* ★ backup_version 추가 */
                         status = ?, 
                         name = ?, 
                         last_connected_at = NOW() 
                     WHERE id = ?`,
                    [
                        payload.current_version, 
                        payload.backup_version, /* ★ payload에서 추출 */
                        payload.status, 
                        payload.name, 
                        devicePkId
                    ]
                );
            } else {
                // disconnect 등 연결이 끊겼을 때는 버전과 이름은 놔두고 상태와 시간만 갱신
                await db.execute(
                    `UPDATE devices 
                     SET status = ?, 
                         last_connected_at = NOW() 
                     WHERE id = ?`,
                    [payload.status, devicePkId]
                );
            }
        } else if (type === 'log') {
            console.log(`Log from [ID:${devicePkId}]: ${payload.status} - ${payload.message}`);

            // --TODO: 변경된 LOG 방식에 맞게 업데이트
        }

    } catch (error) {
        console.error('MQTT Message Error:', error);
    }
});

client.on('error', (err) => {
    console.error('MQTT Error: ', err);
});

module.exports = client;