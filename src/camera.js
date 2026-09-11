/**
 * 카메라 캡처 — 손가락 PPG
 *
 * 크로스 디바이스 주의사항 (전부 실제 제약)
 * ① torch(플래시)를 getUserMedia 제약조건에 넣으면 미지원 기기에서
 *    OverconstrainedError가 나며 **카메라 자체가 열리지 않는다**.
 *    → 카메라를 먼저 열고 getCapabilities()로 지원 여부를 확인한 뒤 켠다.
 * ② facingMode 'environment'가 없으면(전면 웹캠만 있는 기기) 'user'로 폴백.
 * ③ iOS는 <video playsinline>이 없으면 전체화면으로 강제 전환된다.
 * ④ requestVideoFrameCallback은 Firefox 미지원 → requestAnimationFrame 폴백.
 */

const CANVAS_SIZE = 64; // 프레임 분석용 축소 크기 — 성능 확보

export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.track = null;
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.torchOn = false;
    this.lightSource = null;
  }

  /** 카메라를 연다. 후면 → 전면 순으로 시도. */
  async start() {
    if (!window.isSecureContext) {
      const err = new Error('notSecure');
      err.code = 'notSecure';
      throw err;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const err = new Error('noCamera');
      err.code = 'noCamera';
      throw err;
    }

    // ① 후면 카메라 시도
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
    } catch (e) {
      // ② 전면(웹캠) 폴백
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (e2) {
        const err = new Error(e2?.name === 'NotAllowedError' ? 'denied' : 'noCamera');
        err.code = err.message;
        throw err;
      }
    }

    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    this.track = this.stream.getVideoTracks()[0] ?? null;

    await this.enableTorch();
    return this;
  }

  /**
   * 플래시를 켠다. 미지원이면 화면을 흰색으로 채워 광원을 대신한다.
   * @returns {Promise<'torch'|'screen'|'none'>} 실제로 사용된 광원
   */
  async enableTorch() {
    try {
      const caps = this.track?.getCapabilities?.() ?? {};
      if (caps.torch) {
        await this.track.applyConstraints({ advanced: [{ torch: true }] });
        this.torchOn = true;
        return 'torch';
      }
    } catch {
      /* 제약 적용 실패 — 화면 광원으로 폴백 */
    }
    this.showScreenLight();
    return this.lightSource ? 'screen' : 'none';
  }

  showScreenLight() {
    if (this.lightSource) return;
    const el = document.getElementById('lightSource');
    if (el) {
      el.hidden = false;
      this.lightSource = el;
    }
  }

  hideScreenLight() {
    if (this.lightSource) {
      this.lightSource.hidden = true;
      this.lightSource = null;
    }
  }

  /**
   * 프레임당 녹색채널 평균을 샘플로 뽑는다.
   * @param {number} now performance.now() 기준 시각(ms)
   * @returns {{t:number, green:number, level:number}|null}
   */
  readSample(now) {
    if (this.video.readyState < 2 || !this.video.videoWidth) return null;

    this.ctx.drawImage(this.video, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const { data } = this.ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // PPG는 녹색광 흡수 변화가 가장 커서 G채널 SNR이 우수하다.
    // 가장자리는 손가락이 카메라를 다 가리지 못할 수 있어 중앙 50%만 사용.
    const margin = Math.floor(CANVAS_SIZE * 0.25);
    let sum = 0;
    let count = 0;
    for (let y = margin; y < CANVAS_SIZE - margin; y++) {
      for (let x = margin; x < CANVAS_SIZE - margin; x++) {
        sum += data[(y * CANVAS_SIZE + x) * 4 + 1];
        count++;
      }
    }
    const green = count > 0 ? sum / count : 0;

    return { t: now, green, level: green };
  }

  /** 모든 자원을 해제한다. 플래시·화면광도 함께 끈다. */
  stop() {
    try {
      if (this.torchOn && this.track) {
        this.track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      }
    } catch {
      /* 무시 */
    }
    this.torchOn = false;
    this.hideScreenLight();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.track = null;
    if (this.video) this.video.srcObject = null;
  }
}

/**
 * 프레임 수집 루프. requestVideoFrameCallback을 우선 사용하고, 없으면 rAF로 폴백.
 * @param {Camera} camera
 * @param {(sample:{t:number,green:number,level:number})=>void} onSample
 * @returns {() => void} 중지 함수
 */
export function startSampling(camera, onSample) {
  let stopped = false;

  const supportsRVFC = typeof camera.video.requestVideoFrameCallback === 'function';

  if (supportsRVFC) {
    const tick = () => {
      if (stopped) return;
      const s = camera.readSample(performance.now());
      if (s) onSample(s);
      camera.video.requestVideoFrameCallback(tick);
    };
    camera.video.requestVideoFrameCallback(tick);
  } else {
    const tick = () => {
      if (stopped) return;
      const s = camera.readSample(performance.now());
      if (s) onSample(s);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  return () => {
    stopped = true;
  };
}

/**
 * 원시 샘플 배열을 목표 샘플링률로 균일하게 재표본화한다.
 * 브라우저·기기에 따라 실제 프레임률이 24~60fps로 달라지므로
 * FFT 주파수 축을 일정하게 만들려면 이 과정이 반드시 필요하다.
 *
 * @param {{t:number,green:number}[]} samples
 * @param {number} targetFs 목표 샘플링률(Hz)
 * @returns {{values:Float64Array, fs:number}}
 */
export function resample(samples, targetFs = 15) {
  if (samples.length < 2) return { values: new Float64Array(0), fs: targetFs };

  const t0 = samples[0].t;
  const duration = (samples[samples.length - 1].t - t0) / 1000;
  const n = Math.max(2, Math.round(duration * targetFs));
  const values = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const target = t0 + (i / targetFs) * 1000;
    // 선형 보간
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t <= target) lo = mid;
      else hi = mid;
    }
    const span = samples[hi].t - samples[lo].t;
    const ratio = span > 0 ? (target - samples[lo].t) / span : 0;
    values[i] = samples[lo].green + (samples[hi].green - samples[lo].green) * ratio;
  }

  return { values, fs: targetFs };
}
