/**
 * src/features/share.js
 * HeartTune — 공유 이미지: "자세히 보기" 화면과 같은 내용·같은 순서로 그린다.
 *
 * 내용은 detail-view.js 의 뷰모델(단일 소스)에서 받아오고,
 * 캔버스 레이아웃은 자세히 보기 시트의 구성을 그대로 따른다.
 *  1) 브랜드 마크 + 앱 이름        (헤더)
 *  2) 맥박 큰 숫자 카드            (details-overview-bpm)
 *  3) 측정일시 · 측정시간 카드 2개  (details-overview-item)
 *  4) 카메라 측정 파형 다크 카드    (details-waveform-section)
 *  5) 참고 신호 행 4개             (indicator-grid)
 *  6) 참고 고지                    (details-legal)
 */

import { buildDetailViewModel } from './detail-view.js';

const CARD_WIDTH = 1080;
const CARD_SIDE = 60;
const CONTENT_WIDTH = 840;
const PAD = 40;

const COLORS = {
  page: '#F6F7FB',
  card: '#FFFFFF',
  ink: '#111C2D',
  sub: '#475569',
  line: '#D6E0EA',
  accent: '#D93848',
  accentDeep: '#B61C32',
  heroBgTop: '#FFF5F6',
  heroBorder: '#F2C4CD',
  wave: '#090D16',
  waveLine: '#FF5A6A',
  brandBg: '#B61C32'
};

/* 지표 카드 색 — main.css 의 .indicator-card 상태색과 동일 */
const TONE_COLORS = {
  active: { bg: '#FEF2F2', border: '#FCA5A5', light: '#DC2626', state: '#B91C1C', mark: '!' },
  clear: { bg: '#F0FDF4', border: '#86EFAC', light: '#16A34A', state: '#15803D', mark: '✓' },
  'quality-good': { bg: '#EFF6FF', border: '#93C5FD', light: '#2563EB', state: '#1D4ED8', mark: '✓' },
  'quality-fair': { bg: '#FFFBEB', border: '#FCD34D', light: '#D97706', state: '#B45309', mark: '!' },
  'quality-poor': { bg: '#F1F5F9', border: '#CBD5E1', light: '#64748B', state: '#475569', mark: '!' },
  'quality-unknown': { bg: '#F1F5F9', border: '#CBD5E1', light: '#64748B', state: '#475569', mark: '!' }
};

function wrapText(ctx, text, maxWidth) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines = [];
  let line = '';
  const pushLongWord = (word) => {
    let segment = '';
    for (const character of [...word]) {
      const next = segment + character;
      if (segment && ctx.measureText(next).width > maxWidth) {
        lines.push(segment);
        segment = character;
      } else {
        segment = next;
      }
    }
    return segment;
  };

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      return;
    }
    if (line) lines.push(line);
    line = ctx.measureText(word).width > maxWidth ? pushLongWord(word) : word;
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** 브랜드 마크(favicon·헤더와 동일 도형)를 캔버스에 그린다. */
function drawBrandMark(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.beginPath();
  ctx.roundRect(0, 0, 100, 100, 24);
  ctx.fillStyle = COLORS.brandBg;
  ctx.fill();
  ctx.translate(14, 14);
  ctx.scale(0.72, 0.72);
  const heart = new Path2D('M50 78 C50 78 20 56 20 35 C20 23 30 16 40 16 C46 16 50 20 50 25 C50 20 54 16 60 16 C70 16 80 23 80 35 C80 56 50 78 50 78 Z');
  ctx.fillStyle = '#FFFFFF';
  ctx.fill(heart);
  const pulse = new Path2D('M24 48 L40 48 L46 34 L54 62 L60 48 L76 48');
  ctx.strokeStyle = COLORS.brandBg;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(pulse);
  ctx.restore();
}

/** 세로 배치 계산: 같은 함수로 높이를 재고(측정), 같은 순서로 그린다(그리기). */
function buildLayout(ctx, model) {
  const rows = [];
  const centerX = CARD_WIDTH / 2;
  const contentX = (CARD_WIDTH - CONTENT_WIDTH) / 2;
  let y = PAD + 52;

  // 1) 브랜드 헤더
  rows.push({ type: 'brand', name: model.brand, y });
  y += 78;

  // 2) 맥박 히어로 카드 (details-overview-bpm 과 동일 구성)
  rows.push({ type: 'bpm', y });
  y += 320;

  // 3) 측정일시 · 측정시간 카드 2개 (details-overview-item 과 동일 구성)
  rows.push({ type: 'meta', y });
  y += 168;

  // 4) 파형 섹션 (제목 + 다크 카드)
  ctx.font = '800 40px sans-serif';
  rows.push({ type: 'sectionTitle', text: model.waveform.title, y });
  y += 62;
  rows.push({ type: 'wave', y, height: 240 });
  y += 240 + 26;

  // 5) 참고 신호 행 (indicator-grid 와 동일 구성)
  model.indicators.forEach((ind) => {
    ctx.font = '500 28px sans-serif';
    const hintLines = wrapText(ctx, ind.hint, CONTENT_WIDTH - 190);
    const height = 30 + 46 + 10 + hintLines.length * 38 + 30;
    rows.push({ type: 'indicator', ind, hintLines, y, height });
    y += height + 18;
  });

  // 6) 참고 고지 (details-legal)
  ctx.font = '500 30px sans-serif';
  const legal = wrapText(ctx, model.legal, CONTENT_WIDTH - 40);
  rows.push({ type: 'legal', lines: legal, y });
  y += legal.length * 42 + PAD + 44;

  return { rows, height: y + CARD_SIDE, centerX, contentX };
}

/** 파형 다크 카드 — drawDetailsWaveform(main.js) 과 같은 격자·선 스타일. */
function drawWaveCard(ctx, values, x, y, width, height) {
  ctx.fillStyle = COLORS.wave;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 24);
  ctx.fill();

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    ctx.moveTo(x, y + (height / 4) * i);
    ctx.lineTo(x + width, y + (height / 4) * i);
  }
  for (let i = 1; i < 6; i++) {
    ctx.moveTo(x + (width / 6) * i, y);
    ctx.lineTo(x + (width / 6) * i, y + height);
  }
  ctx.stroke();

  if (values.length < 2) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.8, max - min);
  ctx.strokeStyle = COLORS.waveLine;
  ctx.lineWidth = 5;
  ctx.shadowColor = 'rgba(255, 90, 106, 0.45)';
  ctx.shadowBlur = 10;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  values.forEach((value, index) => {
    const px = x + 24 + (index / (values.length - 1)) * (width - 48);
    const py = y + height - 24 - ((value - min) / range) * (height - 48);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawLayout(ctx, model, layout) {
  const { centerX, contentX } = layout;

  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, CARD_WIDTH, layout.height);

  ctx.fillStyle = COLORS.card;
  ctx.beginPath();
  ctx.roundRect(CARD_SIDE, 40, CARD_WIDTH - CARD_SIDE * 2, layout.height - 80, 40);
  ctx.fill();

  ctx.textBaseline = 'top';

  layout.rows.forEach((row) => {
    if (row.type === 'brand') {
      drawBrandMark(ctx, centerX - 130, row.y, 56);
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.ink;
      ctx.font = '800 46px sans-serif';
      ctx.fillText(row.name, centerX - 50, row.y + 6);
      ctx.textAlign = 'center';
    } else if (row.type === 'bpm') {
      ctx.fillStyle = COLORS.heroBgTop;
      ctx.beginPath();
      ctx.roundRect(contentX, row.y, CONTENT_WIDTH, 296, 28);
      ctx.fill();
      ctx.strokeStyle = COLORS.heroBorder;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.sub;
      ctx.font = '700 34px sans-serif';
      ctx.fillText(model.bpm.label, centerX, row.y + 34);

      ctx.font = '800 168px sans-serif';
      const numberWidth = ctx.measureText(model.bpm.value).width;
      ctx.font = '700 44px sans-serif';
      const unitWidth = ctx.measureText(model.bpm.unit).width;
      const total = numberWidth + 26 + unitWidth;
      const numberX = centerX - total / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.accent;
      ctx.font = '800 168px sans-serif';
      ctx.fillText(model.bpm.value, numberX, row.y + 96);
      ctx.fillStyle = COLORS.accentDeep;
      ctx.font = '700 44px sans-serif';
      ctx.fillText(model.bpm.unit, numberX + numberWidth + 26, row.y + 210);
      ctx.textAlign = 'center';
    } else if (row.type === 'meta') {
      const gap = 20;
      const cardW = (CONTENT_WIDTH - gap) / 2;
      model.meta.forEach((item, i) => {
        const x = contentX + i * (cardW + gap);
        ctx.fillStyle = '#F8FAFC';
        ctx.beginPath();
        ctx.roundRect(x, row.y, cardW, 144, 22);
        ctx.fill();
        ctx.strokeStyle = '#E3EAF4';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.sub;
        ctx.font = '700 30px sans-serif';
        ctx.fillText(item.label, x + 28, row.y + 26);
        ctx.fillStyle = COLORS.ink;
        // 긴 날짜 문자열(EN 등)이 카드를 벗어나지 않게 폭에 맞춰 축소한다.
        let valueFont = 38;
        ctx.font = `800 ${valueFont}px sans-serif`;
        while (valueFont > 24 && ctx.measureText(item.value).width > cardW - 56) {
          valueFont -= 2;
          ctx.font = `800 ${valueFont}px sans-serif`;
        }
        ctx.fillText(item.value, x + 28, row.y + 74);
      });
      ctx.textAlign = 'center';
    } else if (row.type === 'sectionTitle') {
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.ink;
      ctx.font = '800 40px sans-serif';
      ctx.fillText(row.text, contentX + 4, row.y);
      ctx.textAlign = 'center';
    } else if (row.type === 'wave') {
      drawWaveCard(ctx, model.waveform.values, contentX, row.y, CONTENT_WIDTH, row.height);
    } else if (row.type === 'indicator') {
      const tone = TONE_COLORS[row.ind.tone] || TONE_COLORS.clear;
      ctx.fillStyle = tone.bg;
      ctx.beginPath();
      ctx.roundRect(contentX, row.y, CONTENT_WIDTH, row.height, 24);
      ctx.fill();
      ctx.strokeStyle = tone.border;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 원 아이콘 (✓ / !) — indicator-light 와 동일
      ctx.beginPath();
      ctx.arc(contentX + 60, row.y + row.height / 2, 26, 0, Math.PI * 2);
      ctx.fillStyle = tone.light;
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tone.mark, contentX + 60, row.y + row.height / 2 - 18);

      // 라벨 + 상태 필
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.ink;
      ctx.font = '800 36px sans-serif';
      ctx.fillText(row.ind.label, contentX + 118, row.y + 30);
      ctx.font = '800 32px sans-serif';
      const stateWidth = ctx.measureText(row.ind.state).width;
      const pillX = contentX + CONTENT_WIDTH - 30 - stateWidth - 44;
      const pillY = row.y + 24;
      ctx.strokeStyle = tone.state;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, stateWidth + 44, 52, 26);
      ctx.stroke();
      ctx.fillStyle = tone.state;
      ctx.fillText(row.ind.state, pillX + 22, pillY + 9);

      // 설명
      ctx.fillStyle = COLORS.sub;
      ctx.font = '500 28px sans-serif';
      row.hintLines.forEach((line, i) => ctx.fillText(line, contentX + 118, row.y + 86 + i * 38));
    } else if (row.type === 'legal') {
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.sub;
      ctx.font = '500 30px sans-serif';
      row.lines.forEach((line, i) => ctx.fillText(line, centerX, row.y + i * 42));
    }
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** 공유용 캔버스(과 Blob)를 만든다. 뷰모델은 detail-view.js 의 단일 소스를 쓴다. */
function renderShareCanvas(record, { t, formatDateTime, formatNumber = (v) => String(v) }) {
  const model = buildDetailViewModel(record, { t, formatDateTime, formatNumber });

  const measure = document.createElement('canvas').getContext('2d');
  const layout = buildLayout(measure, model);

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = Math.ceil(layout.height);
  const ctx = canvas.getContext('2d');
  drawLayout(ctx, model, layout);

  // toBlob()의 비동기 콜백 뒤에는 모바일 브라우저의 사용자 활성화가 만료될 수 있어
  // Web Share 호출이나 다운로드 클릭이 무시된다. 카드가 작으므로 동기 PNG 인코딩을 사용한다.
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: 'image/png' });
  const ts = new Date(record.timestamp ?? Date.now());
  const pad2 = (n) => String(n).padStart(2, '0');
  const fileName = `HeartTune_${ts.getFullYear()}${pad2(ts.getMonth() + 1)}${pad2(ts.getDate())}_${pad2(ts.getHours())}${pad2(ts.getMinutes())}${pad2(ts.getSeconds())}.png`;
  return { blob, fileName };
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** 이미지를 만들고 Web Share(파일)로 내보낸다.
 *  공유 시트를 지원하는 브라우저에서는 닫기(취소)·실패 모두 파일을 저장하지 않고,
 *  Web Share 자체가 없는 브라우저에서만 다운로드로 대체한다. */
export async function shareResultAsImage(record, options) {
  if (!record) return;
  const { blob, fileName } = renderShareCanvas(record, options);
  const file = new File([blob], fileName, { type: 'image/png' });

  if (typeof navigator.share === 'function'
    && navigator.canShare
    && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: options.t('share.card.title'),
        text: `${options.t('share.card.title')}: ${record.bpm} ${options.t('measure.unit.bpm')} (${options.t(`result.${record.status}.title`)})`,
        files: [file]
      });
    } catch (_) {
      // 사용자가 공유 시트를 그냥 닫은 경우(취소) — 저장하지 않고 끝낸다.
    }
    return;
  }

  triggerDownload(blob, fileName);
}

/** 공유 시트를 거치지 않고 항상 이미지 파일로 바로 내려받는다. (브라우저 기본 다운로드 표시만 사용) */
export function downloadResultAsImage(record, options = {}) {
  if (!record) return;
  const { blob, fileName } = renderShareCanvas(record, options);
  triggerDownload(blob, fileName);
}
