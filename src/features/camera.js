/**
 * src/features/camera.js
 * 오늘심박 (HeartTune) — 카메라 스트림 제어
 *
 * 설계 원칙 (docs/20-architecture.md 5-8):
 *  · torch 는 제약조건에 넣지 않고, 스트림을 연 뒤 getCapabilities() 로 확인하고 적용한다.
 *    → 플래시가 없는 PC/노트북에서 OverconstrainedError 로 카메라가 아예 안 열리는 문제 방지
 *  · 후면 카메라(facingMode: environment) 실패 시 기본 카메라로 폴백
 *  · enumerateDevices() 결과를 <select> 에 채워 사용자가 직접 선택할 수 있게 한다.
 */

export function createCameraController({ videoEl, selectEl, log = () => {}, onNoTorch = () => {} }) {
  let stream = null;
  let videoTrack = null;

  async function populateCameraList() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      if (videoInputs.length === 0) return;

      const previous = selectEl.value;
      selectEl.innerHTML = '';
      videoInputs.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId || (idx === 0 ? 'environment' : 'user');
        opt.textContent = dev.label || `카메라 ${idx + 1}`;
        selectEl.appendChild(opt);
      });
      // 옵션을 새로 채운 뒤에는 반드시 하나를 선택 상태로 만든다.
      // (선택이 없으면 <select> 가 빈 칸으로 보여 "카메라가 없다"처럼 오해된다)
      const canRestore = previous && Array.from(selectEl.options).some((o) => o.value === previous);
      if (canRestore) selectEl.value = previous;
      else selectEl.selectedIndex = 0;
    } catch (err) {
      log(`enumerateDevices failed: ${err.message}`);
    }
  }

  /**
   * 카메라를 열고 torch 를 가능한 경우 켠다.
   * @returns {{torchEnabled: boolean}}
   */
  async function open() {
    const selectedVal = selectEl.value;
    let opened = null;

    try {
      const constraints =
        !selectedVal || selectedVal === 'environment' || selectedVal === 'user'
          ? {
              video: {
                facingMode: { ideal: selectedVal || 'environment' },
                width: { ideal: 320 },
                height: { ideal: 240 }
              },
              audio: false
            }
          : {
              video: { deviceId: { exact: selectedVal }, width: { ideal: 320 }, height: { ideal: 240 } },
              audio: false
            };
      opened = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (firstErr) {
      log(`Primary camera failed (${firstErr.name}), falling back to default video`);
      opened = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    stream = opened;
    videoEl.srcObject = stream;
    await videoEl.play();
    await populateCameraList();

    videoTrack = stream.getVideoTracks()[0] || null;

    let torchEnabled = false;
    if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
      const caps = videoTrack.getCapabilities();
      if (caps && caps.torch) {
        try {
          await videoTrack.applyConstraints({ advanced: [{ torch: true }] });
          torchEnabled = true;
          log('Rear flash (torch) activated.');
        } catch (torchErr) {
          log(`Torch applyConstraints failed: ${torchErr.message}`);
        }
      }
    }

    if (!torchEnabled) onNoTorch();

    return { torchEnabled };
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    videoTrack = null;
    try {
      videoEl.srcObject = null;
    } catch (_) {
      // 무시
    }
  }

  return {
    populateCameraList,
    open,
    stop,
    get videoTrack() {
      return videoTrack;
    },
    get isOpen() {
      return Boolean(stream);
    }
  };
}
