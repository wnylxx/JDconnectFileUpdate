const mqtt = require('mqtt');
require('dotenv').config();

const client = mqtt.connect(process.env.MQTT_HOST);

client.on('connect', () => {
    console.log('Connected to MQTT Broker');

    // RPi들의 상태 보고(status)와 로그(log)를 구독합니다.
    // 토픽: status/프로젝트ID/장비ID, log/프로젝트ID/장비ID
    client.subscribe('status/+/+');
    client.subscribe('log/+/+');
});

client.on('message', (topic, message) => {
    // --TODO: 메시지 처리 로직(DB 업데이트 등) 구현



    console.log(`MSG received [${topic}]: ${message.toString()}`);
});

client.on('error', (err) => {
    console.error('MQTT Error: ', err);
});

module.exports = client;