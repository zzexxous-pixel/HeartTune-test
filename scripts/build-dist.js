/**
 * scripts/build-dist.js
 * 오늘심박 (HeartTune) — 운영(및 개발 Pages) 배포용 정적 산출물 dist/ 생성
 *
 *  1) 런타임 파일을 src/ 구조 그대로 복사 (하위 폴더 자동 포함)
 *  2) 모든 파일 내용으로 빌드 해시(8자)를 계산
 *  3) Service Worker 캐시 이름을 해시로 자동 교체 → 배포할 때마다 캐시가 자동 무효화
 *  4) index.html 에 <meta name="hearttune-build"> 삽입 → 라이브 화면에서 빌드 식별 가능
 *  5) 모든 텍스트 자산(JS/CSS/manifest/sw.js)에 빌드 해시 주입 → 운영 스모크가 내용으로 신/구버전 판별 가능
 *  6) 절대경로(/...) 사용 금지 + 참조된 로컬 자산 누락 검사 (GitHub Pages 하위 경로 호환)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// 빌드에 포함할 런타임 파일 (경로는 저장소 루트 기준)
const RUNTIME_FILES = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'src/main.css',
  'src/main.js',
  'src/dsp.js',
  'src/i18n.js',
  'src/features/camera.js',
  'src/features/share.js',
  'src/features/storage.js'
];

const SW_CACHE_PATTERN = /const CACHE_NAME = '[^']*';/;

function ensureCleanDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyRuntimeFiles() {
  for (const relPath of RUNTIME_FILES) {
    const srcPath = path.join(ROOT_DIR, relPath);
    const destPath = path.join(DIST_DIR, relPath);

    if (!fs.existsSync(srcPath)) {
      throw new Error(`필수 런타임 파일이 누락되었습니다: ${relPath}`);
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }
}

/** 런타임 파일 내용을 정렬해 합친 뒤 짧은 빌드 해시를 만든다. */
function computeBuildHash() {
  const hash = crypto.createHash('sha256');
  for (const relPath of [...RUNTIME_FILES].sort()) {
    hash.update(relPath);
    hash.update(fs.readFileSync(path.join(ROOT_DIR, relPath)));
  }
  return hash.digest('hex').slice(0, 8);
}

function verifyRelativePaths(htmlContent) {
  // GitHub Pages 하위 경로(/HeartTune/) 호환을 위해 루트 절대경로 참조 차단
  const forbiddenPatterns = [
    /href=[\"']\/(?!\/)/,
    /src=[\"']\/(?!\/)/,
    /register\(\s*[\"']\/(?!\/)/
  ];
  for (const regex of forbiddenPatterns) {
    if (regex.test(htmlContent)) {
      throw new Error(`절대경로 참조가 검출되었습니다 (${regex}). GitHub Pages 호환을 위해 './' 상대경로를 사용하세요.`);
    }
  }
}

/** index.html 이 참조하는 로컬 자산이 dist 에 실제로 존재하는지 확인한다. */
function verifyReferencedAssets(indexHtml) {
  const refs = new Set();
  const attrPattern = /(?:href|src)=[\"'](\.\/[^\"'?#]+)[\"']/g;
  let match;
  while ((match = attrPattern.exec(indexHtml)) !== null) {
    refs.add(match[1].replace(/^\.\//, ''));
  }

  const missing = [];
  for (const relPath of refs) {
    if (relPath.startsWith('data:')) continue;
    if (!fs.existsSync(path.join(DIST_DIR, relPath))) missing.push(relPath);
  }
  if (missing.length > 0) {
    throw new Error(`index.html 이 참조하지만 dist 에 없는 파일: ${missing.join(', ')}`);
  }
  return refs.size;
}

function injectBuildVersion(buildHash) {
  const htmlPath = path.join(DIST_DIR, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  const meta = `<meta name="hearttune-build" content="${buildHash}" />`;
  if (html.includes('name="hearttune-build"')) {
    html = html.replace(/<meta name="hearttune-build" content="[^"]*" \/>/, meta);
  } else {
    html = html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\r\n  ${meta}`);
  }
  fs.writeFileSync(htmlPath, html, 'utf8');

  // 빌드 해시가 바뀌면 Service Worker 캐시가 자동으로 새 이름을 갖는다.
  const swPath = path.join(DIST_DIR, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  if (!SW_CACHE_PATTERN.test(sw)) {
    throw new Error("sw.js 에서 CACHE_NAME 선언을 찾지 못했습니다. 캐시 버전 자동화가 불가능합니다.");
  }
  fs.writeFileSync(
    swPath,
    sw.replace(SW_CACHE_PATTERN, `const CACHE_NAME = 'hearttune-cache-${buildHash}';`),
    'utf8'
  );
}

/**
 * 모든 텍스트 자산에 빌드 해시를 주입해 지속 가능한 스모크 체계를 만든다.
 * - JS/CSS/sw.js: 맨 앞에 /* hearttune-build: <해시> *\/ 주석
 * - manifest.webmanifest: JSON에 _build 필드 추가 (PWA가 무시하는 커스텀 필드)
 * 이렇게 하면 운영에서 서빙 중인 각 파일이 기대 빌드를 포함하는지로 신/구버전을 판별할 수 있다.
 * 파일 시간(Last-Modified)이나 1회용 심볼(createCameraController) 대신 내용 기반 판별로 지속 가능.
 */
function injectBuildHashIntoAssets(buildHash) {
  const textAssets = [
    'src/main.css',
    'src/main.js',
    'src/dsp.js',
    'src/i18n.js',
    'src/features/camera.js',
    'src/features/storage.js',
    'src/features/share.js',
    'sw.js'
  ];

  const marker = `hearttune-build: ${buildHash}`;
  for (const relPath of textAssets) {
    const filePath = path.join(DIST_DIR, relPath);
    let content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes(marker)) {
      content = `/* ${marker} */\n` + content;
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }

  // manifest.webmanifest는 JSON이므로 주석을 쓸 수 없어 필드로 주입
  const manifestPath = path.join(DIST_DIR, 'manifest.webmanifest');
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const data = JSON.parse(raw);
    data._build = buildHash;
    fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.warn(`[build-dist] manifest 주입 실패 (무시): ${e.message}`);
  }
}

function build() {
  ensureCleanDir(DIST_DIR);
  copyRuntimeFiles();

  const buildHash = computeBuildHash();
  injectBuildVersion(buildHash);
  injectBuildHashIntoAssets(buildHash);

  const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8');
  verifyRelativePaths(indexHtml);
  const refCount = verifyReferencedAssets(indexHtml);

  // GitHub Pages 에서 언더스코어(_)나 특수 폴더 처리 지연을 막기 위한 .nojekyll 추가
  fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '', 'utf8');

  console.log(
    `[build-dist] 성공: ${RUNTIME_FILES.length}개 파일 · 참조 자산 ${refCount}개 검증 · 빌드 ${buildHash} · 캐시 hearttune-cache-${buildHash}`
  );
}

build();
