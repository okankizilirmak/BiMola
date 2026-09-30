export function createFullscreenController({
  stageElement,
  bodyElement,
  documentRef,
  onStateChange = () => {}
} = {}) {
  if (!stageElement || !bodyElement || !documentRef) {
    throw new Error("Tam ekran denetleyicisi icin oyun sahnesi ve belge gereklidir.");
  }

  const requestNativeFullscreen =
    stageElement.requestFullscreen || stageElement.webkitRequestFullscreen;
  const exitNativeFullscreen =
    documentRef.exitFullscreen || documentRef.webkitExitFullscreen;
  const state = {
    active: false,
    nativeActive: false,
    supported: typeof requestNativeFullscreen === "function"
  };

  function getNativeFullscreenElement() {
    return documentRef.fullscreenElement || documentRef.webkitFullscreenElement || null;
  }

  function getState() {
    return { ...state };
  }

  function notify() {
    onStateChange(getState());
  }

  function applyTheaterMode() {
    state.active = true;
    stageElement.classList.add("is-theater");
    bodyElement.classList.add("is-game-theater");
  }

  function clearTheaterMode() {
    state.active = false;
    state.nativeActive = false;
    stageElement.classList.remove("is-theater");
    bodyElement.classList.remove("is-game-theater");
  }

  async function enter() {
    applyTheaterMode();
    notify();

    if (!state.supported) {
      return getState();
    }

    try {
      await requestNativeFullscreen.call(stageElement);
      state.nativeActive = getNativeFullscreenElement() === stageElement;
    } catch {
      state.nativeActive = false;
    }

    notify();
    return getState();
  }

  async function exit() {
    const nativeElement = getNativeFullscreenElement();
    if (nativeElement === stageElement && typeof exitNativeFullscreen === "function") {
      try {
        await exitNativeFullscreen.call(documentRef);
      } catch {
        return getState();
      }
    }

    clearTheaterMode();
    notify();
    return getState();
  }

  async function toggle() {
    return state.active ? exit() : enter();
  }

  function syncFromDocument() {
    const nativeElement = getNativeFullscreenElement();
    if (nativeElement === stageElement) {
      applyTheaterMode();
      state.nativeActive = true;
      notify();
      return getState();
    }

    if (state.nativeActive) {
      clearTheaterMode();
      notify();
    }
    return getState();
  }

  function cleanup() {
    clearTheaterMode();
  }

  return { cleanup, enter, exit, getState, syncFromDocument, toggle };
}
