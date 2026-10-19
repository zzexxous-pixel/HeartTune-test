/**
 * src/features/sheets.js
 * 오늘심박 (HeartTune) — 바텀시트 열기/닫기 + 접근성(포커스/ESC) 관리
 *
 *  · 한 번에 하나의 시트만 열린다. (다른 시트를 열면 이전 시트는 즉시 닫힌다)
 *  · 배경(backdrop) 클릭 / ESC / [data-sheet-close] 버튼으로 닫는다.
 *  · 닫을 때 마지막 트리거로 포커스를 돌려준다.
 *  · 열려 있는 시트 안에서 Tab 이 순환하도록 간단한 포커스 트랩을 둔다.
 */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createSheetController({ backdrop, onOpen = () => {}, onClose = () => {}, log = () => {} }) {
  let openSheet = null;
  let lastTrigger = null;

  function hide(sheet) {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
  }

  function close() {
    if (!openSheet) return;
    const closed = openSheet;
    hide(closed);
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
    openSheet = null;
    onClose(closed);
    if (lastTrigger && typeof lastTrigger.focus === 'function' && document.contains(lastTrigger)) {
      lastTrigger.focus({ preventScroll: true });
    }
    lastTrigger = null;
    log(`Sheet closed: ${closed.id}`);
  }

  function open(sheet, trigger = null) {
    if (!sheet) return;
    if (openSheet === sheet) return;

    if (openSheet) hide(openSheet);

    openSheet = sheet;
    lastTrigger = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');

    const focusTarget = sheet.querySelector('[data-autofocus]') || sheet.querySelector(FOCUSABLE);
    if (focusTarget) {
      // transform 트랜지션이 시작된 뒤 포커스를 주어 스크롤 점프를 막는다.
      window.setTimeout(() => {
        if (openSheet === sheet) focusTarget.focus({ preventScroll: true });
      }, 60);
    }

    onOpen(sheet);
    log(`Sheet opened: ${sheet.id}`);
  }

  function onKeydown(event) {
    if (!openSheet) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusables = Array.from(openSheet.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bind() {
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', onKeydown);
    document.querySelectorAll('[data-sheet-close]').forEach((btn) => {
      btn.addEventListener('click', close);
    });
  }

  return {
    bind,
    open,
    close,
    get isOpen() {
      return Boolean(openSheet);
    },
    get current() {
      return openSheet;
    }
  };
}
