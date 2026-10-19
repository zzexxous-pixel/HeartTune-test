/**
 * src/features/share.js
 * 오늘심박 (HeartTune) — 측정 결과를 큰 글씨 이미지로 만들어 공유/저장
 *
 * 가족 공유가 핵심 유스케이스(docs/10-spec.md 4-8):
 *  · 모바일: Web Share API 로 카카오톡 등에 바로 전송
 *  · 미지원/PC: PNG 다운로드로 폴백
 *  · 이미지 구성: 브랜드 + BPM(220px) + 판정 문구 + 측정 시각 + 파형 + 법적 고지
 */

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

const BADGE_COLORS = {
  normal: { bg: '#ECFDF5', fg: '#065F46' },
  brady: { bg: '#EFF6FF', fg: '#1E40AF' },
  tachy: { bg: '#FFFBEB', fg: '#92400E' },
  irregular: { bg: '#FFF1F2', fg: '#9F1239' }
};

function drawResultCard(ctx, record, { t, formatDateTime }) {
  ctx.fillStyle = '#0F4C81';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(60, 60, 960, 1230, 40);
  ctx.fill();

  ctx.fillStyle = '#0F4C81';
  ctx.font = '800 54px sans-serif';
  ctx.fillText('❤️ 오늘심박 (HeartTune)', 120, 165);

  ctx.fillStyle = '#4B5563';
  ctx.font = '600 34px sans-serif';
  ctx.fillText(formatDateTime(record.timestamp), 120, 225);

  ctx.fillStyle = '#111827';
  ctx.font = '900 220px sans-serif';
  ctx.fillText(`${record.bpm}`, 120, 470);

  ctx.fillStyle = '#4B5563';
  ctx.font = '800 58px sans-serif';
  ctx.fillText(t('measure.unit.bpm'), 540, 460);

  const col = BADGE_COLORS[record.status] || BADGE_COLORS.normal;
  ctx.fillStyle = col.bg;
  ctx.beginPath();
  ctx.roundRect(120, 540, 840, 210, 28);
  ctx.fill();

  ctx.fillStyle = col.fg;
  ctx.font = '800 52px sans-serif';
  ctx.fillText(t(`result.${record.status}.title`), 160, 625);

  ctx.font = '600 34px sans-serif';
  ctx.fillText(t(`result.${record.status}.desc`).slice(0, 38), 160, 695);

  if (record.waveform && record.waveform.length > 2) {
    ctx.strokeStyle = '#0F4C81';
    ctx.lineWidth = 6;
    ctx.beginPath();
    const wf = record.waveform;
    const minW = Math.min(...wf);
    const maxW = Math.max(...wf);
    const rangeW = Math.max(1, maxW - minW);
    wf.forEach((val, idx) => {
      const x = 120 + (idx / (wf.length - 1)) * 840;
      const y = 980 - ((val - minW) / rangeW) * 140;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  ctx.fillStyle = '#6B7280';
  ctx.font = '500 28px sans-serif';
  ctx.fillText(t('legal.disclaimer.main'), 120, 1210);
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
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  drawResultCard(ctx, record, { t, formatDateTime });

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const fileName = `HeartTune_${record.bpm}bpm_${Date.now()}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: t('app.brand.name'),
          text: `${t('app.brand.name')}: ${record.bpm} ${t('measure.unit.bpm')} (${t(`result.${record.status}.title`)})`,
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
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }, 'image/png');
}
