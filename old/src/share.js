/**
 * 결과 이미지 생성 — 가족에게 공유하는 것이 핵심 유스케이스다.
 * 부모님이 혼자 보셔도 자녀가 바로 알아볼 수 있게 큰 글씨·높은 대비로 만든다.
 */

const SIZE = 1080;

/**
 * @param {object} r 측정 결과
 * @param {object} labels i18n으로 번역된 라벨 모음
 * @returns {Promise<Blob>}
 */
export async function renderResultImage(r, labels) {
  const cv = document.createElement('canvas');
  cv.width = SIZE;
  cv.height = SIZE;
  const ctx = cv.getContext('2d');

  const tone =
    r.rhythm === 'irregular'
      ? '#f87171'
      : r.verdict === 'normal'
        ? '#34d399'
        : r.verdict === 'brady'
          ? '#fbbf24'
          : '#f87171';

  // 배경
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 상단 브랜드
  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.arc(110, 130, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f1f5f9';
  ctx.font = '700 56px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(labels.appName, 160, 132);

  // 큰 BPM 숫자
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f1f5f9';
  ctx.font = '800 300px system-ui, sans-serif';
  ctx.fillText(String(r.bpm), SIZE / 2, 400);

  ctx.font = '600 52px system-ui, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(labels.bpmLabel, SIZE / 2, 560);

  // 판정
  ctx.fillStyle = tone;
  ctx.font = '700 64px system-ui, sans-serif';
  ctx.fillText(labels.verdict, SIZE / 2, 680);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 46px system-ui, sans-serif';
  ctx.fillText(labels.rhythm, SIZE / 2, 760);

  // 측정 시각
  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 38px system-ui, sans-serif';
  ctx.fillText(labels.when, SIZE / 2, 850);

  // 법적 고지 (공유 이미지에 남기는 것이 안전하다)
  ctx.fillStyle = '#64748b';
  ctx.font = '400 28px system-ui, sans-serif';
  wrapText(ctx, labels.disclaimer, SIZE / 2, 940, SIZE - 140, 38);

  return new Promise((resolve, reject) => {
    cv.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = String(text).split(' ');
  let line = '';
  let lineY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, cx, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, lineY);
}
