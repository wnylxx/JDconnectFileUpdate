// 파일 시스템 조작(폴더 생성, 이동), 압축(zip) 담당 (도구상자)
const fs = require('fs-extra') // 기존 fs보다 강력한 파일 시스템 도구
const archiver = require('archiver');
const path = require('path');

/**
 * 폴더를 Zip으로 압축하는 함수 (Promise 변환)
 * @param {string} sourceDir - 압축할 원본 폴더 경로
 * @param {string} outPath - 생성될 Zip 파일의 전체 경로
 */

const compressFolder = (sourceDir, outPath) => {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = archiver('zip', {
            zlib: { level: 9} // 최대 압축률 설정
        });

        output.on('close', () => {
            console.log(`Compressed: ${archive.pointer()} total byte`);
            resolve();
        });

        archive.pipe(output);

        // 폴더 내용물을 zip 루트에 추가
        archive.directory(sourceDir, false);

        archive.finalize();
    });
};

/**
 * 임시 폴더 삭제 등 청소 작업
 */
const removeFolder = async (folderPath) => {
    try {
        await fs.remove(folderPath);
    } catch (err) {
        console.error(`Failed to remove folder: ${folderpath}`, err);
    }
};

module.exports = {
    compressFolder,
    removeFolder,
    fs
};
