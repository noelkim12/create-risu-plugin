/**
 * UpdateDialog Custom Element
 * 플러그인 업데이트 확인 다이얼로그 컴포넌트
 */

import { updateDialogStyles } from "../../styles/index.js";
import { PLUGIN_NAME } from "../../../constants.js";
const ELEMENT_TAG = `${PLUGIN_NAME}-update-dialog`;

export class UpdateDialog extends HTMLElement {
  constructor() {
    super();
    this._cleanup = null;
  }

  static get observedAttributes() {
    return [
      "name",
      "current-version",
      "version",
      "released-at",
      "mandatory",
      "notes",
      "title",
      "btn-update",
      "btn-later",
      "btn-skip",
    ];
  }

  connectedCallback() {
    this.render();
    this.attachEventListeners();
    // 포커스 설정 - data 속성으로 안전하게 선택
    setTimeout(() => this.querySelector('[data-action="update"]')?.focus(), 0);
  }

  disconnectedCallback() {
    if (this._cleanup) {
      this._cleanup();
    }
  }

  get name() {
    return this.getAttribute("name") || "";
  }

  get currentVersion() {
    return this.getAttribute("current-version") || "0.0.0";
  }

  get version() {
    return this.getAttribute("version") || "0.0.0";
  }

  get releasedAt() {
    return this.getAttribute("released-at") || new Date().toISOString();
  }

  get mandatory() {
    return this.hasAttribute("mandatory");
  }

  get notes() {
    const notesAttr = this.getAttribute("notes");
    if (!notesAttr) return [];
    try {
      return JSON.parse(notesAttr);
    } catch {
      return [];
    }
  }

  get i18n() {
    return {
      title: this.getAttribute("title") || "플러그인 업데이트 준비 완료",
      primary: this.getAttribute("btn-update") || "지금 업데이트",
      later: this.getAttribute("btn-later") || "나중에",
      skip: this.getAttribute("btn-skip") || "이번 버전 건너뛰기",
    };
  }

  render() {
    const t = this.i18n;
    const mandatory = this.mandatory;
    const notes = this.notes;
    const s = updateDialogStyles; // 스타일 별칭

    this.setAttribute("role", "dialog");
    this.setAttribute("aria-modal", "true");
    this.className = s.udRoot;

    const releasedDate = new Date(this.releasedAt).toLocaleDateString();
    const updateType = mandatory ? "필수 업데이트" : "선택 업데이트";

    const notesList =
      notes.length > 0
        ? notes
            .slice(0, 8)
            .map(
              (n) =>
                `<li class="${s[`ud${this.escapeHtml(n.type || "").trim().charAt(0).toUpperCase() + this.escapeHtml(n.type || "").trim().slice(1)}`] || ""}">${this.escapeHtml(n.text || "")}</li>`
            )
            .join("")
        : "<li>세부 변경사항은 릴리스 노트를 참고해주세요</li>";

    this.innerHTML = `
      <div class="${s.udCard}" data-update-card>
        <div class="${s.udTitle}">
          <h3>${t.title}${this.name ? ` · ${this.name}` : ""}</h3>
          <span class="${s.udPill}">v${this.currentVersion} → v${this.version}</span>
        </div>
        <div class="${s.udSub}">
          ${releasedDate} · ${updateType}
        </div>
        <ul class="${s.udList}" aria-label="변경사항">
          ${notesList}
        </ul>
        <div class="${s.udActions}">
          ${!mandatory ? `<button class="${s.udBtnGhost}" data-action="later">${t.later}</button>` : ""}
          ${!mandatory ? `<button class="${s.udBtnGhost}" data-action="skip">${t.skip}</button>` : ""}
          <button class="${s.udBtnPrimary}" data-action="update">${t.primary}</button>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    const mandatory = this.mandatory;

    // 키보드 이벤트
    const onKey = (e) => {
      if (e.key === "Escape" && !mandatory) {
        this.dispatchAction("later");
      }
      if (e.key === "Enter") {
        this.dispatchAction("update");
      }
    };

    // 배경 클릭
    this.addEventListener("click", (e) => {
      if (!mandatory && e.target === this) {
        this.dispatchAction("later");
      }
    });

    // 버튼 클릭 - data-action 속성으로 안전하게 처리
    const buttons = this.querySelectorAll('[data-action]');
    buttons.forEach((btn) => {
      const action = btn.getAttribute('data-action');
      btn.addEventListener("click", () => this.dispatchAction(action));
    });

    document.addEventListener("keydown", onKey);

    // Cleanup 함수 저장
    this._cleanup = () => {
      document.removeEventListener("keydown", onKey);
    };
  }

  dispatchAction(action) {
    const detail = { action };

    if (action === "skip") {
      detail.skipVersion = this.version;
    }

    // Custom Event 발생
    this.dispatchEvent(
      new CustomEvent("update-action", {
        detail,
        bubbles: true,
        composed: true,
      })
    );
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
  customElements.define(ELEMENT_TAG, UpdateDialog);
}

export const UPDATE_DIALOG_TAG = ELEMENT_TAG;
