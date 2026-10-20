/**
 * src/features/share.js
 * HeartTune — 센터 정렬 결과 카드 (BPM, 파형, 참고 신호, 읽을 수 있는 고지)
 */

import { getResultIndicators } from './result-indicators.js';

const CARD_WIDTH = 1080;
const CARD_SIDE = 60;
const CONTENT_WIDTH = 840;

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
    if (ctx.measureText(word).width > maxWidth) {
      line = pushLongWord(word);
    } else {
      line = word;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}


function getPillRows(ctx, pills, maxWidth) {
  const rows = [];
  let row = [];
  let usedWidth = 0;
  ctx.font = '700 30px sans-serif';

  pills.forEach((pill) => {
    const width = Math.min(maxWidth, ctx.measureText(pill.text).width + 44);
    if (row.length && usedWidth + 18 + width > maxWidth) {
      rows.push(row);
      row = [];
      usedWidth = 0;
    }
    row.push({ ...pill, width });
    usedWidth += (row.length > 1 ? 18 : 0) + width;
  });
  if (row.length) rows.push(row);
  return rows;
}

function createLayout(ctx, record, { t, formatDateTime }) {
  const centerX = CARD_WIDTH / 2;
  const contentX = (CARD_WIDTH - CONTENT_WIDTH) / 2;
  let y = 112;

  ctx.font = '800 56px sans-serif';
  const title = wrapText(ctx, t('share.card.title'), CONTENT_WIDTH);
  const titleY = y;
  const titleLineHeight = 68;
  y += title.length * titleLineHeight + 18;

  ctx.font = '500 30px sans-serif';
  const date = wrapText(ctx, formatDateTime(record.timestamp), CONTENT_WIDTH);
  const dateY = y;
  const dateLineHeight = 42;
  y += date.length * dateLineHeight + 56;

  const bpmY = y;
  y += 275;
  const unitY = y + 64;
  y += 100;

  ctx.font = '800 36px sans-serif';
  const waveformTitle = wrapText(ctx, t('share.waveform.label'), CONTENT_WIDTH);
  const waveformTitleY = y;
  const waveformTitleLineHeight = 46;
  y += waveformTitle.length * waveformTitleLineHeight + 18;
  const graphY = y;
  const graphHeight = 230;
  y += graphHeight + 52;

  ctx.font = '800 48px sans-serif';
  const resultTitle = wrapText(ctx, t(`result.${record.status}.title`), CONTENT_WIDTH);
  const resultTitleY = y;
  const resultTitleLineHeight = 60;
  y += resultTitle.length * resultTitleLineHeight + 16;

  ctx.font = '500 32px sans-serif';
  const resultDescription = wrapText(ctx, t(`result.${record.status}.desc`), CONTENT_WIDTH);
  const resultDescriptionY = y;
  const descriptionLineHeight = 44;
  y += resultDescription.length * descriptionLineHeight + 26;

  const indicators = getResultIndicators(record);
  const flags = ['arrhythmia', 'bradycardia', 'tachycardia'].filter((name) => indicators[name]);
  const pills = flags.length
    ? flags.map((name) => ({ text: t(`measure.indicator.${name}`), kind: 'flag' }))
    : [{ text: t('history.indicators.none'), kind: 'neutral' }];
  pills.push({
    text: `${t('measure.indicator.signalQuality')}: ${t(`measure.indicator.quality.${indicators.quality}`)}`,
    kind: 'quality'
  });
  const pillRows = getPillRows(ctx, pills, CONTENT_WIDTH);
  const pillsY = y;
  const pillHeight = 58;
  const pillGap = 14;
  y += pillRows.length * pillHeight + Math.max(0, pillRows.length - 1) * pillGap + 44;

  ctx.font = '500 28px sans-serif';
  const legal = wrapText(ctx, t('legal.disclaimer.main'), CONTENT_WIDTH);
  const legalY = y;
  const legalLineHeight = 40;
  y += legal.length * legalLineHeight + 72;

  return {
    centerX,
    contentX,
    title,
    titleY,
    titleLineHeight,
    date,
    dateY,
    dateLineHeight,
    bpmY,
    unitY,
    waveformTitle,
    waveformTitleY,
    waveformTitleLineHeight,
    graphY,
    graphHeight,
    resultTitle,
    resultTitleY,
    resultTitleLineHeight,
    resultDescription,
    resultDescriptionY,
    descriptionLineHeight,
    pillRows,
    pillsY,
    pillHeight,
    pillGap,
    legal,
    legalY,
    legalLineHeight,
    height: Math.max(1420, y)
  };
}

function drawCenteredLines(ctx, lines, centerX, y, lineHeight) {
  lines.forEach((line, index) => ctx.fillText(line, centerX, y + index * lineHeight));
}

function drawPills(ctx, rows, centerX, startY, pillHeight, rowGap) {
  const colors = {
    flag: { bg: '#FEE2E2', fg: '#991B1B', border: '#FCA5A5' },
    quality: { bg: '#EFF6FF', fg: '#1E40AF', border: '#93C5FD' },
    neutral: { bg: '#F1F5F9', fg: '#334155', border: '#CBD5E1' }
  };

  rows.forEach((row, rowIndex) => {
    const totalWidth = row.reduce((sum, pill) => sum + pill.width, 0) + Math.max(0, row.length - 1) * 18;
    let x = centerX - totalWidth / 2;
    const y = startY + rowIndex * (pillHeight + rowGap);
    row.forEach((pill) => {
      const color = colors[pill.kind];
      ctx.fillStyle = color.bg;
      ctx.strokeStyle = color.border;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, pill.width, pillHeight, 26);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color.fg;
      ctx.font = '700 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pill.text, x + pill.width / 2, y + pillHeight / 2, pill.width - 24);
      x += pill.width + 18;
    });
  });
}

function drawWaveform(ctx, record, x, y, width, height) {
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 24);
  ctx.fill();

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 1;
  for (let column = 1; column < 8; column += 1) {
    const gridX = x + (width * column) / 8;
    ctx.beginPath();
    ctx.moveTo(gridX, y + 18);
    ctx.lineTo(gridX, y + height - 18);
    ctx.stroke();
  }
  for (let row = 1; row < 4; row += 1) {
    const gridY = y + (height * row) / 4;
    ctx.beginPath();
    ctx.moveTo(x + 18, gridY);
    ctx.lineTo(x + width - 18, gridY);
    ctx.stroke();
  }

  const waveform = Array.isArray(record.waveform) ? record.waveform : [];
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (waveform.length > 2) {
    const min = Math.min(...waveform);
    const max = Math.max(...waveform);
    const range = Math.max(0.001, max - min);
    waveform.forEach((value, index) => {
      const pointX = x + 24 + (index / (waveform.length - 1)) * (width - 48);
      const pointY = y + height - 24 - ((value - min) / range) * (height - 48);
      if (index === 0) ctx.moveTo(pointX, pointY);
      else ctx.lineTo(pointX, pointY);
    });
  } else {
    ctx.moveTo(x + 24, y + height / 2);
    ctx.lineTo(x + width - 24, y + height / 2);
  }
  ctx.stroke();
}

function drawResultCard(ctx, record, layout) {
  const { centerX, contentX } = layout;
  const cardHeight = layout.height - 80;
  ctx.fillStyle = '#EAF1F8';
  ctx.fillRect(0, 0, CARD_WIDTH, layout.height);
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(CARD_SIDE, 40, CARD_WIDTH - CARD_SIDE * 2, cardHeight, 40);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#0F4C81';
  ctx.font = '800 56px sans-serif';
  drawCenteredLines(ctx, layout.title, centerX, layout.titleY, layout.titleLineHeight);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 30px sans-serif';
  drawCenteredLines(ctx, layout.date, centerX, layout.dateY, layout.dateLineHeight);

  ctx.fillStyle = '#111827';
  ctx.font = '900 220px sans-serif';
  const bpm = String(record.bpm);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bpm, centerX, layout.bpmY);
  ctx.fillStyle = '#475569';
  ctx.font = '800 54px sans-serif';
  ctx.fillText(t('measure.unit.bpm'), centerX, layout.unitY);

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#0F4C81';
  ctx.font = '800 36px sans-serif';
  drawCenteredLines(ctx, layout.waveformTitle, centerX, layout.waveformTitleY, layout.waveformTitleLineHeight);
  drawWaveform(ctx, record, contentX, layout.graphY, CONTENT_WIDTH, layout.graphHeight);

  const badge = {
    normal: { bg: '#ECFDF5', fg: '#065F46' },
    brady: { bg: '#EFF6FF', fg: '#1E40AF' },
    tachy: { bg: '#FFFBEB', fg: '#92400E' },
    irregular: { bg: '#FFF1F2', fg: '#9F1239' }
  }[record.status] || { bg: '#EFF6FF', fg: '#1E40AF' };
  ctx.fillStyle = badge.fg;
  ctx.font = '800 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  drawCenteredLines(ctx, layout.resultTitle, centerX, layout.resultTitleY, layout.resultTitleLineHeight);

  ctx.fillStyle = '#334155';
  ctx.font = '500 32px sans-serif';
  drawCenteredLines(ctx, layout.resultDescription, centerX, layout.resultDescriptionY, layout.descriptionLineHeight);

  drawPills(ctx, layout.pillRows, centerX, layout.pillsY, layout.pillHeight, layout.pillGap);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  drawCenteredLines(ctx, layout.legal, centerX, layout.legalY, layout.legalLineHeight);
}

/**
 * 결과를 이미지로 공유하거나(Web Share) 다운로드한다.
 * @param {object} record 측정 기록
 * @param {{t:Function, formatDateTime:Function}} deps i18n 헬퍼
 */
export async function shareResultAsImage(record, { t, formatDateTime }) {
  if (!record) return;

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  const measureCtx = canvas.getContext('2d');
  const layout = createLayout(measureCtx, record, { t, formatDateTime });
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  drawResultCard(ctx, record, layout);

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

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
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
