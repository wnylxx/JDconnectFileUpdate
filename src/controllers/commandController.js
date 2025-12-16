// web으로 부터 명령을 받고, 대상을 선별하고, DB에 로그를 남긴 뒤, MQTT 메세지를 쏘는 것을 담당
const db = require('../config/db');
const mqttClient = require('../config/mqtt');

const deployService = require('../services/deployService');

exports.sendUpdateCommand = async (req, res) => {
    try {
        const { project_id, package_id, target_device_ids } = req.body;

        // 1. 유효성 검사
        if (!project_id || !package_id || !target_device_ids) {
            return res.status(400).json({ success: false, message: "필수 정보가 누락되었습니다." });
        }

        // 2. 패키지 정보 조회 (버전, 다운로드 URL)
        const [packages] = await db.execute(
            'SELECT version, file_path FROM packages WHERE id = ? AND project_id = ?',
            [package_id, project_id]
        );

        if (packages.length === 0) {
            return res.status(404).json({ success: false, message: "존재하지 않는 패키지입니다." });
        }

        const { version, file_path } = packages[0];

        // 3. 공통 서비스 호출! (로직 재사용)
        const count = await deployService.deployPackageToDevices(
            project_id, 
            package_id, 
            version, 
            file_path, 
            target_device_ids
        );

        // const packageInfo = packages[0]; 

        // 다운로드 URL이 상대 경로라면 전체 URL로 만들어주는 것이 좋습니다.
        // (환경변수나 설정을 통해 호스트 주소를 붙여줍니다. 여기서는 예시로 로컬호스트 사용)
        // 실제 운영 시에는 process.env.SERVER_HOST 등을 사용하세요.
        // 예: http://192.168.0.10:3000/uploads/...
        // 여기서는 DB에 저장된 값을 그대로 사용한다고 가정합니다.
        // ************ 현재 DB에는 상대 주소로 되어있슴 -> uploads/prject/1/version.zip 형태
        //                -> 그래서 Rpi에서 가져갈때, path.join 해서 사용하고 있는 중

        // 3. 대상 장비(Device) 리스트 확정
        // let finalDeviceList = [];

        // if (target_device_ids.includes("ALL")) {
        //     // "전체 선택"인 경우, DB에서 해당 프로젝트의 모든 장비를 조회
        //     const [devices] = await db.execute(
        //         'SELECT device_id FROM devices WHERE project_id = ?',
        //         [project_id]
        //     );
        //     finalDeviceList = devices.map(d => d.device_id);
        // } else {
        //     // "개별 선택"인 경우, 요청받은 리스트 그대로 사용
        //     finalDeviceList = target_device_ids;
        // }

        // if (finalDeviceList.length === 0) {
        //     return res.status(400).json({ success: false, message: "업데이트할 대상 장비가 없습니다." });
        // }

        // console.log(`[Command] Sending Update to ${finalDeviceList.length} devices. (Version: ${packageInfo.version})`);

        // // 4. 반복문: DB 로그 기록 및 MQTT 발행
        // // (Promise.all을 사용하여 병렬 처리로 속도를 높입니다)
        // const tasks = finalDeviceList.map(async (devId) => {
        //     // 4-1. DB 조회: device_uuid로 device table의 id(PK)를 알아내야 로그에 남길 수 있음
        //     // (최적화를 위해선 위에서 가져올 때 id도 같이 가져오는게 좋지만, 로직 분리를 위해 여기서 처리)
        //     const [devRows] = await db.execute(
        //         'SELECT id FROM devices WHERE device_id = ?',
        //         [devId]
        //     )
        //     if (devRows.length === 0) {
        //         console.log(`Device PK ${devId} not found in DB. Skipping`);
        //         return;
        //     }
        //     const deviceDbId = devRows[0].id;

        //     // 4-2. devices 테이블에서 deviec status를 'updating'으로 변경
        //     // 디바이스의 관리 상태를 바꾸는 주체를 Server로 할지, Rpi에서 명령을 받았을 때 할지 중에 서버쪽 관리를 택함
        //     // Rpi 관리 시 에러 발생 시 대응이 느림(무한루프)
        //     await db.execute(
        //         "UPDATE devices SET status = 'updating' WHERE id = ?",
        //         [deviceDbId]
        //     );

        //     // 4-2. Update_Logs 테이블에 'pending' 상태로 기록
        //     await db.execute(
        //         `INSERT INTO update_logs (device_pk, package_id, command_type, status, message)
        //         VALUES (?, ?, 'update', 'pending', 'Update Command Sent')`,
        //         [deviceDbId, package_id]
        //     );

        //     // 4-3. MQTT 메시지 생성
        //     const topic = `cmd/${project_id}/${devId}`;
        //     const payload = JSON.stringify({
        //         command: "UPDATE",
        //         version: packageInfo.version,
        //         download_url: packageInfo.file_path, // TODO: 현재 상대 좌표임 추후 절대 좌표로 바꿔야함
        //         package_id: package_id,
        //         timestamp: new Date().toISOString()
        //     });

        //     // 4-4 MQTT 발생 (QoS 1: 적어도 1회 전달 보장)
        //     mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
        //         if (err) console.error(`MQTT Publish Error (${devId} : )`, err);
        //         else console.log(`Sent to ${topic}`);
        //     });
        // });

        // await Promise.all(tasks);

        // 5. 최종 응답
        // res.json({
        //     success: true,
        //     message: `${finalDeviceList.length}대의 장비에 업데이트 명령을 전송했습니다.`,
        //     data: {
        //         target_count: finalDeviceList.length,
        //         version: packageInfo.version
        //     }
        // });

        res.json({
            success: true,
            message: `${count}대 장비에 업데이트 명령 재전송 완료`,
            data: { count } // 이전 코드에서는 version 도 받았는데
        });

    } catch (error) {
        console.error("Command Error:", error);
        res.status(500).json({ success: false, message: "서버 오류 발생", error: error.message });
    }
};



/**
 * 1. DB에 device_uuid 대신 device_id 로 했고, 데이터 타입은 Int 값이다. => 데이터 타입 varchar로 변경했음
 * 2. 위 코드에서 device_uuid는 유니크값인데 왜 굳이 id를 따로 뽑아서 명령을 수행하는 건가? device_uuid로 명령 보내면 되는거 아닌가?
 * 3. const deviceDBId = devRows[0].id; 이부분에서 정상적인 상황에선 devRows.length 가 1이 되겠지? 근데 비정상적인 상황을 대비해서 devRows[0] 으로 써주는 거야?
 */

/**
 * 1. device_id(식별자)가 있지만 id(PK)를 찾아서 쓰는 이유 - DB 성능과 데이터 무결성(참조 관계) 때문
 *  - PK로 검색하는게 속도가 가장 빠르고, update_logs 테이블에 device_id 컬럼을 FK로 devices의 id(PK)를 설정했기 때문
 * 
 * 2. devRows[0] 으로 쓰는 이유
 *  - 유니크한 ID로 검색했기 때문에, 결과가 딱 1개만 나오겠지만, mysql2 라이브러리는 SELECT의 결과를 항상 Array 형태로 반환한다. 그렇기 때문에 [0]을 해서 값을 꺼내야한다.
 *  - 여기에 length 체크를 해주면 더 좋다.
 * 
 * 3. JDConnect의 Device id 는 52001 과 같은 int 형태이지만, MQTT 토픽은 무조건 문자열을 받아야 하기 때문에 String으로 받아서 가는게 좋다.
 */

exports.sendRollbackCommand = async (req, res) => {
    try {
        const { project_id, target_device_ids } = req.body;

        // 1. 유효성 검사
        if (!project_id || !target_device_ids) {
            return res.status(400).json({ success: false, message: "필수 정보가 누락되어있습니다."})
        }

        // 2. 대상 장비 리스트 확정
        let finalDeviceList = [];
        if (target_device_ids.includes("ALL")) {
            const [devices] = await db.execute(
                'SELECT device_id FROM devices WHERE project_id = ?',
                [project_id]
            );
            finalDeviceList = devices.map(d => d.device_id);
        } else {
            finalDeviceList = target_device_ids;
        }

        if (finalDeviceList.length === 0) {
            return res.status(400).json({ success: false, message: "롤백할 대상 장비가 없습니다."});
        }

        console.log(`[Rollback] Sending Rollback to ${finalDeviceList.length} devices.`);

        // 3. 반복문: 상태 변경 -> 로그 기록 -> MQTT 발행
        const tasks = finalDeviceList.map(async (devId) => {
            // 3-1. DB 조회
            const [devRows] = await db.execute(
                'SELECT id FROM devices WHERE device_id = ?',
                [devId]
            );

            if (devRows.length === 0 ) {
                console.log(`Device Code ${targetCode} not found in DB.`);
                return;
            }

            const devicePK = devRows[0].id

            // 3-2. 장비 상태를 'updating'으로 변경 (롤백도 업데이트의 일종)
            await db.execute(
                "UPDATE devices SET status = 'updating' WHERE id = ?",
                [devicePK]
            );

            // 3-3. Update_Logs 테이블에 'Pending' 기록 (command_type = 'rollback')
            // 롤백은 특정 package_id를 지정하기 어려우므로 NULL로 들어갈 수 있음
            await db.execute(
                `INSERT INTO update_logs (device_pk, command_type, status, message) 
                 VALUES (?, 'rollback', 'pending', 'Rollback Command Sent')`,
                 [devicePK]
            );

            // 3-4 MQTT 메시지 생성
            const topic = `cmd/${project_id}/${devId}`;
            const payload = JSON.stringify({
                command: "ROLLBACK",
                timestamp: new Date().toISOString()
            });

            // 3-5. MQTT 발행
            mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
                if (err) console.error(`MQTT Publish Error (${devId}):`, err);
                else console.log(`Rollback Sent to ${topic}`);
            });
        });

        await Promise.all(tasks);

        res.json({
            success: true,
            message: `${finalDeviceList.length}대의 장비에 롤백 명령을 전송했습니다.`,
            data: { count: finalDeviceList.length }
        });

    } catch (error) {
        console.error("Rollback Error", error);
        res.status(500).json({ success: false, message: "서버 오류 발생", error: error.message});
    }
}



/**
 * updatelog에 status가 필요한가?
 * devices의 status만 놔두면 되는거 아님?
 */