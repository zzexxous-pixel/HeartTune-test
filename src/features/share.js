/**
 * src/features/share.js
 * HeartTune — 공유 이미지: 제목 + "자세히 보기" 화면과 같은 내용 (측정일시부터 참고 고지까지)
 */

import { getResultIndicators } from './result-indicators.js';

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
  wave: '#090D16',
  waveLine: '#FF5A6A',
  clearFg: '#15803D',
  clearBg: '#F0FDF4',
  activeFg: '#B91C1C',
  activeBg: '#FEF2F2',
  fair: '#B45309',
  unknownFg: '#475569',
  unknownBg: '#F1F5F9'
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

/** 세로 배치 계산: 같은 함수로 높이를 재고(측정), 같은 순서로 그린다(그리기). */
function buildLayout(ctx, record, { t, formatDateTime, formatNumber }) {
  const indicators = getResultIndicators(record);
  const rows = [];
  let y = PAD + 40;

  ctx.font = '800 62px sans-serif';
  const title = wrapText(ctx, t('share.card.title'), CONTENT_WIDTH);
  rows.push({ type: 'title', lines: title, y });
  y += title.length * 74 + 36;

  // 측정일시 · 측정시간
  const meta = [
    { label: t('details.measurementTime'), value: formatDateTime(record.timestamp) },
    { label: t('details.duration'), value: t('details.duration.value', { seconds: record.duration }) }
  ];
  rows.push({ type: 'meta', items: meta, y });
  y += meta.length * 64 + 16;

  // 맥박 (큰 숫자)
  rows.push({ type: 'bpm', label: t('details.heartRate'), value: formatNumber(record.bpm), unit: t('measure.unit.bpm'), y });
  y += 310;

  // 파형
  ctx.font = '800 38px sans-serif';
  const waveTitle = wrapText(ctx, t('measure.waveform.title'), CONTENT_WIDTH);
  rows.push({ type: 'sectionTitle', lines: waveTitle, y });
  y += waveTitle.length * 48 + 12;
  rows.push({ type: 'wave', y, height: 200 });
  y += 200 + 40;

  // 지표 카드 (부정맥·서맥·빈맥·신호 품질)
  const cards = [
    { key: 'arrhythmia', label: t('measure.indicator.arrhythmia'), active: indicators.arrhythmia, hint: t('measure.indicator.arrhythmiaHint') },
    { key: 'bradycardia', label: t('measure.indicator.bradycardia'), active: indicators.bradycardia, hint: t('measure.indicator.bradycardiaHint') },
    { key: 'tachycardia', label: t('measure.indicator.tachycardia'), active: indicators.tachycardia, hint: t('measure.indicator.tachycardiaHint') },
    {
      key: 'quality',
      label: t('measure.indicator.signalQuality'),
      quality: indicators.quality,
      state: t(`measure.indicator.quality.${indicators.quality}`),
      hint: t('measure.indicator.signalQualityHint')
    }
  ];
  cards.forEach((card) => {
    const cardState = card.quality
      ? t(`measure.indicator.quality.${card.quality}`)
      : t(card.active ? 'measure.indicator.detected' : 'measure.indicator.notDetected');
    ctx.font = '800 36px sans-serif';
    const labelLines = wrapText(ctx, card.label, CONTENT_WIDTH - 120);
    ctx.font = '500 28px sans-serif';
    const hintLines = wrapText(ctx, card.hint, CONTENT_WIDTH - 60);
    const height = 36 + labelLines.length * 46 + 10 + 40 + hintLines.length * 40 + 30;
    rows.push({ type: 'card', card, state: cardState, labelLines, hintLines, y, height });
    y += height + 18;
  });
  y += 18;

  // 참고 고지
  ctx.font = '500 30px sans-serif';
  const legal = wrapText(ctx, t('legal.disclaimer.main'), CONTENT_WIDTH);
  rows.push({ type: 'legal', lines: legal, y });
  y += legal.length * 42 + PAD + 40;

  return { rows, height: y + CARD_SIDE };
}

function cardColors(card) {
  if (card.quality) {
    if (card.quality === 'good') return { fg: COLORS.clearFg, bg: COLORS.clearBg };
    if (card.quality === 'fair') return { fg: COLORS.fair, bg: '#FFFBEB' };
    if (card.quality === 'poor') return { fg: COLORS.activeFg, bg: COLORS.activeBg };
    return { fg: COLORS.unknownFg, bg: COLORS.unknownBg };
  }
  return card.active
    ? { fg: COLORS.activeFg, bg: COLORS.activeBg }
    : { fg: COLORS.clearFg, bg: COLORS.clearBg };
}

function drawWaveform(ctx, record, x, y, width, height) {
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

  const waveform = Array.isArray(record.waveform) ? record.waveform : [];
  if (waveform.length < 2) return;
  const min = Math.min(...waveform);
  const max = Math.max(...waveform);
  const range = Math.max(0.8, max - min);
  ctx.strokeStyle = COLORS.waveLine;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  waveform.forEach((value, index) => {
    const px = x + 20 + (index / (waveform.length - 1)) * (width - 40);
    const py = y + height - 20 - ((value - min) / range) * (height - 40);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

function drawLayout(ctx, record, layout) {
  const centerX = CARD_WIDTH / 2;
  const contentX = (CARD_WIDTH - CONTENT_WIDTH) / 2;

  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, CARD_WIDTH, layout.height);

  ctx.fillStyle = COLORS.card;
  ctx.beginPath();
  ctx.roundRect(CARD_SIDE, 40, CARD_WIDTH - CARD_SIDE * 2, layout.height - 80, 40);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  layout.rows.forEach((row) => {
    if (row.type === 'title') {
      ctx.fillStyle = COLORS.ink;
      ctx.font = '800 62px sans-serif';
      row.lines.forEach((line, i) => ctx.fillText(line, centerX, row.y + i * 74));
    } else if (row.type === 'meta') {
      row.items.forEach((item, i) => {
        const yy = row.y + i * 64;
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.sub;
        ctx.font = '500 32px sans-serif';
        ctx.fillText(item.label, contentX, yy + 8);
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.ink;
        ctx.font = '700 36px sans-serif';
        ctx.fillText(item.value, contentX + CONTENT_WIDTH, yy + 4);
      });
      ctx.textAlign = 'center';
    } else if (row.type === 'bpm') {
      ctx.fillStyle = COLORS.sub;
      ctx.font = '600 34px sans-serif';
      ctx.fillText(row.label, centerX, row.y);
      ctx.fillStyle = COLORS.accent;
      ctx.font = '800 170px sans-serif';
      ctx.fillText(row.value, centerX, row.y + 40);
      ctx.fillStyle = COLORS.sub;
      ctx.font = '600 40px sans-serif';
      ctx.fillText(row.unit, centerX, row.y + 240);
    } else if (row.type === 'sectionTitle') {
      ctx.fillStyle = COLORS.ink;
      ctx.font = '800 38px sans-serif';
      row.lines.forEach((line, i) => ctx.fillText(line, centerX, row.y + i * 48));
    } else if (row.type === 'wave') {
      drawWaveform(ctx, record, contentX, row.y, CONTENT_WIDTH, row.height);
    } else if (row.type === 'card') {
      const { fg, bg } = cardColors(row.card);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(contentX, row.y, CONTENT_WIDTH, row.height, 24);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(contentX + 36, row.y + 36 + 16, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.font = '800 36px sans-serif';
      let yy = row.y + 36;
      row.labelLines.forEach((line, i) => ctx.fillText(line, contentX + 64, yy + i * 46));
      yy += row.labelLines.length * 46 + 10;
      ctx.fillStyle = fg;
      ctx.font = '800 34px sans-serif';
      ctx.fillText(row.state, contentX + 64, yy);
      yy += 40;
      ctx.fillStyle = COLORS.sub;
      ctx.font = '500 28px sans-serif';
      row.hintLines.forEach((line, i) => ctx.fillText(line, contentX + 64, yy + i * 40));
      ctx.textAlign = 'center';
    } else if (row.type === 'legal') {
      ctx.fillStyle = COLORS.sub;
      ctx.font = '500 30px sans-serif';
      row.lines.forEach((line, i) => ctx.fillText(line, centerX, row.y + i * 42));
    }
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** 이미지를 만들고 Web Share(파일) 또는 PNG 다운로드로 내보낸다. */
export async function shareResultAsImage(record, { t, formatDateTime, formatNumber = (v) => String(v) }) {
  if (!record) return;

  const measure = document.createElement('canvas').getContext('2d');
  const layout = buildLayout(measure, record, { t, formatDateTime, formatNumber });

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = Math.ceil(layout.height);
  const ctx = canvas.getContext('2d');
  drawLayout(ctx, record, layout);

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
  const fileName = `HeartTune_${record.bpm}bpm_${Date.now()}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });

  if (typeof navigator.share === 'function'
    && navigator.canShare
    && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: t('share.card.title'),
        text: `${t('share.card.title')}: ${record.bpm} ${t('measure.unit.bpm')} (${t(`result.${record.status}.title`)})`,
        files: [file]
      });
      return;
    } catch (_) {
      // 공유 취소 시 다운로드 폴백 진행
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
