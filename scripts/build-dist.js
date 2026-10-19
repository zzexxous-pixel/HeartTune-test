/**
 * scripts/build-dist.js
 * 운영 저장소(HeartTune) 배포용 정적 산출물(dist/) 생성 및 상대경로 검증 스크립트
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const RUNTIME_FILES = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'src/dsp.js',
  'src/i18n.js'
];

function ensureCleanDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function verifyRelativePaths(htmlContent) {
  // GitHub Pages 하위 경로(/HeartTune/) 호환을 위해 루트 절대경로 참조 차단
  const forbiddenPatterns = [
    /href=["']\/(?!\/)/,
    /src=["']\/(?!\/)/,
    /register\(\s*["']\/(?!\/)/
  ];
  for (const regex of forbiddenPatterns) {
    if (regex.test(htmlContent)) {
      throw new Error(`절대경로 참조가 검출되었습니다 (${regex}). GitHub Pages 호환을 위해 './' 상대경로를 사용하세요.`);
    }
  }
}

function build() {
  ensureCleanDir(DIST_DIR);

  for (const relPath of RUNTIME_FILES) {
    const srcPath = path.join(ROOT_DIR, relPath);
    const destPath = path.join(DIST_DIR, relPath);

    if (!fs.existsSync(srcPath)) {
      throw new Error(`필수 런타임 파일이 누락되었습니다: ${relPath}`);
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }

  const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8');
  verifyRelativePaths(indexHtml);

  // GitHub Pages에서 언더스코어(_)나 특수 폴더 처리 지연을 막기 위한 .nojekyll 추가
  fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '', 'utf8');

  console.log(`[build-dist] 성공: ${RUNTIME_FILES.length}개 런타임 파일이 dist/ 에 준비되었습니다.`);
}

build();