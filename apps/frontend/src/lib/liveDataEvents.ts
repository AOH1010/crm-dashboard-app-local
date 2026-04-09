export const LOAD_LIVE_DATA_EVENT = "crm:load-live-data";

export function emitLoadLiveData() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(LOAD_LIVE_DATA_EVENT));
}
