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
  '.nojekyll',
  'assets/finger-guide-rear.png',
  'assets/finger-guide-front.png',
  'assets/icon-192.png',
  'assets/icon-192-maskable.png',
  'assets/icon-512.png',
  'assets/icon-512-maskable.png',
  'assets/apple-touch-icon.png',
  'index.html',
  'manifest.webmanifest',
  'manifest-dev.webmanifest',
  'manifest-pre.webmanifest',
  'sw.js',
  'src/main.css',
  'src/main.js',
  'src/dsp.js',
  'src/i18n.js',
  'src/features/camera.js',
  'src/features/measurement-policy.js',
  'src/features/detail-view.js',
  'src/features/result-indicators.js',
  'src/features/sheets.js',
  'src/features/share.js',
  'src/features/storage.js'
];

const SW_CACHE_PATTERN = /const CACHE_NAME = '[^']*';/;

/**
 * 빌드 해시를 주입해야 하는 "텍스트 자산" 목록.
 *
 * RUNTIME_FILES 에서 확장자로 **자동 파생**한다. 별도 목록을 손으로 관리하면
 * 새 파일을 RUNTIME_FILES 에만 추가하고 여기에는 빠뜨리는 사고가 난다.
 * (2026-10-25 실제 사고: detail-view.js 가 RUNTIME_FILES·sw.js ASSETS·운영 스모크에는
 *  모두 있었지만 이 목록에만 없어서 운영 스모크가 영구 실패했다.)
 */
const TEXT_ASSET_PATTERN = /\.(?:js|css)$/;

function getTextAssets() {
  return RUNTIME_FILES.filter((relPath) => TEXT_ASSET_PATTERN.test(relPath));
}

/** 매니페스트는 JSON 이라 주석 대신 _build 필드로 해시를 넣는다. */
const MANIFEST_FILES = RUNTIME_FILES.filter((file) => file.endsWith('.webmanifest'));

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

/**
 * 런타임 파일 내용을 정렬해 합친 뒤 짧은 빌드 해시를 만든다.
 *
 * 빌드 스크립트(이 파일) 자신도 해시 입력에 포함한다.
 * 스크립트만 바뀌면(예: 자산에 주입하는 내용이 바뀌면) 산출물이 달라지는데,
 * 해시가 그대로면 "같은 해시 · 다른 내용"인 두 산출물이 생겨
 * 운영 스모크(이관 ③)가 신/구버전을 구분하지 못한다 — 2026-10-25 사고가 정확히 이 상태였다.
 */
function computeBuildHash() {
  const hash = crypto.createHash('sha256');
  for (const relPath of [...RUNTIME_FILES].sort()) {
    hash.update(relPath);
    hash.update(fs.readFileSync(path.join(ROOT_DIR, relPath)));
  }
  hash.update('scripts/build-dist.js');
  hash.update(fs.readFileSync(path.join(ROOT_DIR, 'scripts/build-dist.js')));
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
 * - *.webmanifest: JSON에 _build 필드 추가 (PWA가 무시하는 커스텀 필드)
 * 이렇게 하면 운영에서 서빙 중인 각 파일이 기대 빌드를 포함하는지로 신/구버전을 판별할 수 있다.
 * 파일 시간(Last-Modified)이나 1회용 심볼(createCameraController) 대신 내용 기반 판별로 지속 가능.
 */
function injectBuildHashIntoAssets(buildHash) {
  const marker = `hearttune-build: ${buildHash}`;

  for (const relPath of getTextAssets()) {
    const filePath = path.join(DIST_DIR, relPath);
    let content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes(marker)) {
      content = `/* ${marker} */\n` + content;
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }

  // 매니페스트는 JSON이므로 주석을 쓸 수 없어 필드로 주입.
  // 주입에 실패하면 운영 스모크가 영구 실패하므로 경고로 넘기지 않고 빌드를 중단한다.
  for (const manifestFile of MANIFEST_FILES) {
    const manifestPath = path.join(DIST_DIR, manifestFile);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      throw new Error(`${manifestFile} 를 JSON 으로 읽지 못해 빌드 해시를 주입할 수 없습니다: ${e.message}`);
    }
    data._build = buildHash;
    fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
}

/**
 * dist/ 안의 "해시가 있어야 하는" 텍스트 자산을 실제 산출물에서 열거한다.
 * 주입 목록(getTextAssets)이 아니라 **dist 자체**를 기준으로 삼아야
 * "주입 목록에서 파일이 빠진" 사고를 잡아낼 수 있다(목록을 기준으로 검증하면 자기 자신을 검증하는 셈).
 */
function listDistTextAssets(dir = DIST_DIR, prefix = '') {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...listDistTextAssets(path.join(dir, entry.name), relPath));
    } else if (TEXT_ASSET_PATTERN.test(entry.name) || MANIFEST_FILES.includes(relPath)) {
      found.push(relPath);
    }
  }
  return found.sort();
}

/**
 * 주입 누락 자기검사.
 *
 * "빌드에는 해시가 없는데 운영 스모크는 그 자산에 해시를 요구"하는 상태를
 * 개발 단계(`npm run build` = Dev CI 검증 ③)에서 즉시 실패시킨다.
 * 이 검사가 없으면 문제가 운영 이관 ③에서야 드러나고, 그때는 이미 운영 저장소에
 * 커밋이 반영된 뒤라 "이관은 됐는데 실패로 보이는" 거짓 실패가 된다(2026-10-25 사고).
 */
function verifyBuildHashInjection(buildHash) {
  const marker = `hearttune-build: ${buildHash}`;
  const distAssets = listDistTextAssets();
  // manifest 는 주석을 쓸 수 없어 _build 필드로 넣으므로 아래에서 따로 검사한다.
  const codeAssets = distAssets.filter((relPath) => !MANIFEST_FILES.includes(relPath));

  const missing = codeAssets.filter(
    (relPath) => !fs.readFileSync(path.join(DIST_DIR, relPath), 'utf8').includes(marker)
  );
  if (missing.length > 0) {
    throw new Error(
      `빌드 해시(${buildHash})가 주입되지 않은 텍스트 자산: ${missing.join(', ')}\n` +
        '  → 운영 스모크(이관 ③)가 이 자산에서 실패합니다. 주입 대상 선정(getTextAssets)을 확인하세요.'
    );
  }

  for (const manifestFile of MANIFEST_FILES) {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, manifestFile), 'utf8'));
    if (manifest._build !== buildHash) {
      throw new Error(`${manifestFile} 의 _build 가 기대 빌드 해시(${buildHash})와 다릅니다.`);
    }
  }
  return distAssets.length;
}

function build() {
  ensureCleanDir(DIST_DIR);
  copyRuntimeFiles();

  const buildHash = computeBuildHash();
  injectBuildVersion(buildHash);
  injectBuildHashIntoAssets(buildHash);
  const hashedAssets = verifyBuildHashInjection(buildHash);

  const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8');
  verifyRelativePaths(indexHtml);
  const refCount = verifyReferencedAssets(indexHtml);

  // GitHub Pages 에서 언더스코어(_)나 특수 폴더 처리 지연을 막기 위한 .nojekyll 추가
  fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '', 'utf8');

  console.log(
    `[build-dist] 성공: ${RUNTIME_FILES.length}개 파일 · 참조 자산 ${refCount}개 검증 · ` +
      `해시 주입 ${hashedAssets}개 + index.html/meta + manifest/_build · ` +
      `빌드 ${buildHash} · 캐시 hearttune-cache-${buildHash}`
  );
}

build();
