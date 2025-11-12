import { updateDialogStyles } from "../../styles/index.js";
import { PLUGIN_NAME } from "../../../constants.js";

/**
 * LoadingDialog Custom Element
 * 업데이트 처리 중 표시되는 로딩 다이얼로그 컴포넌트
 */

const ELEMENT_TAG = `${PLUGIN_NAME}-loading-dialog`;

export class LoadingDialog extends HTMLElement {
  constructor() {
    super();
    this._cleanup = null;
  }

  static get observedAttributes() {
    return ["message", "duration"];
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    if (this._cleanup) {
      this._cleanup();
    }
  }

  get message() {
    return this.getAttribute("message") || "업데이트를 처리하고 있습니다...";
  }

  get duration() {
    return parseInt(this.getAttribute("duration")) || 3000;
  }

  render() {
    this.setAttribute("role", "dialog");
    this.setAttribute("aria-modal", "true");
    this.setAttribute("aria-busy", "true");
    this.className = updateDialogStyles.udRoot;

    this.innerHTML = `
      <div class="${updateDialogStyles.udCard} ${updateDialogStyles.udLoading}" data-loading-card>
        <div class="${updateDialogStyles.udLoadingSpinner}">
          <svg class="${updateDialogStyles.udLoadingSvg}" viewBox="0 0 50 50">
            <circle
              class="${updateDialogStyles.udLoadingCircle}"
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke-width="4"
            />
          </svg>
        </div>
        <div class="${updateDialogStyles.udLoadingMessage}">
          ${this.escapeHtml(this.message)}
        </div>
      </div>
    `;
  }

  escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    );
  }
}

// Custom Element 등록
if (!customElements.get(ELEMENT_TAG)) {
  customElements.define(ELEMENT_TAG, LoadingDialog);
}

export const LOADING_DIALOG_TAG = ELEMENT_TAG;

/**
 * LoadingDialog를 표시하고 지정된 시간 후 자동으로 닫음
 * @param {string} message - 표시할 메시지
 * @param {number} [duration=3000] - 표시 시간 (밀리초)
 * @returns {Promise<void>}
 */
export function showLoading(message = "업데이트를 처리하고 있습니다...", duration = 3000) {
  return new Promise((resolve) => {
    const dialog = document.createElement(LOADING_DIALOG_TAG);
    dialog.setAttribute("message", message);
    dialog.setAttribute("duration", String(duration));

    document.body.appendChild(dialog);

    setTimeout(() => {
      dialog.remove();
      resolve();
    }, duration);
  });
}
