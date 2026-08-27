// Transient notification bubble, bottom-right. One toast at a time; auto
// dismisses after 2.6 seconds unless closed sooner.
import { iconSvg } from "./icons.js";
import { getTimingEngine } from "../timing/index.js";

const HOST_ID = "toast-host";
let hideTimer = null;

export function notify(message) {
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  getTimingEngine().clearTimeout(hideTimer);
  host.innerHTML = `
    <div class="toast">
      ${iconSvg("check", 15)} ${message}
      <button aria-label="Dismiss">${iconSvg("x", 14)}</button>
    </div>`;
  host.querySelector("button").addEventListener("click", dismiss);
  hideTimer = getTimingEngine().setTimeout(dismiss, 2600);
}

function dismiss() {
  getTimingEngine().clearTimeout(hideTimer);
  const host = document.getElementById(HOST_ID);
  if (host) host.innerHTML = "";
}
