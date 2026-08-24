// Transient notification bubble, bottom-right. One toast at a time; auto
// dismisses after 2.6 seconds unless closed sooner.
import { iconSvg } from "./icons.js";

const HOST_ID = "toast-host";
let hideTimer = null;

export function notify(message) {
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  window.clearTimeout(hideTimer);
  host.innerHTML = `
    <div class="toast">
      ${iconSvg("check", 15)} ${message}
      <button aria-label="Dismiss">${iconSvg("x", 14)}</button>
    </div>`;
  host.querySelector("button").addEventListener("click", dismiss);
  hideTimer = window.setTimeout(dismiss, 2600);
}

function dismiss() {
  window.clearTimeout(hideTimer);
  const host = document.getElementById(HOST_ID);
  if (host) host.innerHTML = "";
}
