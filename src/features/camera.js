/**
 * src/features/camera.js
 * 오늘심박 (HeartTune) — 카메라 스트림 제어
 *
 * 설계 원칙 (docs/20-architecture.md 5-8):
 *  · 후면 카메라(facingMode: environment)가 기본값이다.
 *  · torch 는 제약조건에 넣지 않고, 스트림을 연 뒤 getCapabilities() 로 확인하고 적용한다.
 *    → 플래시가 없는 PC/노트북에서 OverconstrainedError 로 카메라가 아예 안 열리는 문제 방지
 *  · 페이지 진입 시 open({ torch: false }) 로 미리보기만 켜 두고,
 *    측정 시작 시 setTorch(true) 로 플래시만 켠다. (손가락 위치를 먼저 잡을 수 있게)
 *  · 카메라를 바꾸면 stop() 후 다시 open() 한다.
 */

const VALID_FACING = new Set(['environment', 'user']);

export function createCameraController({ videoEl, log = () => {}, onNoTorch = () => {} }) {
  let stream = null;
  let videoTrack = null;
  let facingMode = 'environment';
  let torchOn = false;
  let opening = null;

  function setFacing(mode) {
    if (!VALID_FACING.has(mode)) return;
    if (facingMode === mode) return;
    facingMode = mode;
    if (stream) stop();
  }

  function supportsTorch() {
    if (!videoTrack || typeof videoTrack.getCapabilities !== 'function') return false;
    try {
      const caps = videoTrack.getCapabilities();
      return Boolean(caps && caps.torch);
    } catch (_) {
      return false;
    }
  }

  async function applyTorch(want) {
    if (!videoTrack) {
      torchOn = false;
      return false;
    }
    if (!want) {
      if (torchOn) {
        try {
          await videoTrack.applyConstraints({ advanced: [{ torch: false }] });
        } catch (err) {
          log(`Torch off failed: ${err.message}`);
        }
      }
      torchOn = false;
      return false;
    }
    if (!supportsTorch()) {
      torchOn = false;
      return false;
    }
    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: true }] });
      torchOn = true;
      log('Rear flash (torch) activated.');
    } catch (err) {
      torchOn = false;
      log(`Torch applyConstraints failed: ${err.message}`);
    }
    return torchOn;
  }

  /**
   * 카메라를 연다. 이미 열려 있으면 torch 상태만 갱신한다.
   * @param {{ torch?: boolean, notifyNoTorch?: boolean }} options
   * @returns {Promise<{torchEnabled: boolean}>}
   */
  async function open({ torch = false, notifyNoTorch = false } = {}) {
    // 동시에 두 번 호출되면(진입 시 미리보기 + 측정 시작) 같은 스트림을 공유한다.
    if (opening) await opening;
    if (stream) {
      const torchEnabled = torch ? await applyTorch(true) : torchOn;
      if (torch && !torchEnabled && notifyNoTorch) onNoTorch();
      return { torchEnabled };
    }

    opening = (async () => {
      const constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        },
        audio: false
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        log(`Primary camera failed (${firstErr.name}), falling back to default video`);
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      videoEl.srcObject = stream;
      try {
        await videoEl.play();
      } catch (playErr) {
        // iOS 저전력 모드 등에서 자동재생이 막혀도 스트림 자체는 유지한다.
        log(`video.play() blocked: ${playErr.message}`);
      }

      videoTrack = stream.getVideoTracks()[0] || null;
      torchOn = false;
    })();

    try {
      await opening;
    } finally {
      opening = null;
    }

    const torchEnabled = torch ? await applyTorch(true) : false;
    if (torch && !torchEnabled && notifyNoTorch) onNoTorch();
    return { torchEnabled };
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    videoTrack = null;
    torchOn = false;
    try {
      videoEl.srcObject = null;
    } catch (_) {
      // 무시
    }
  }

  return {
    open,
    stop,
    setFacing,
    setTorch: applyTorch,
    get facing() {
      return facingMode;
    },
    get videoTrack() {
      return videoTrack;
    },
    get isOpen() {
      return Boolean(stream);
    }
  };
}
