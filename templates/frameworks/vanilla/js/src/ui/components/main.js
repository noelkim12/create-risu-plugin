import { PLUGIN_NAME } from '../../constants';
import { RisuAPI } from '../../core/risu-api';

// 메인 애플리케이션 클래스
export class App {
  constructor() {
    this.risuAPI = null;
    this.observer = null;
  }

  async initialize() {
    // RisuAPI 싱글톤 인스턴스 가져오기
    this.risuAPI = RisuAPI.getInstance();

    if (!this.risuAPI) {
      console.log(`[${PLUGIN_NAME}] RisuAPI is not initialized`);
      return false;
    }

    // UI 초기화
    this.initializeUI();
    this.startObserver();

    console.log(`[${PLUGIN_NAME}] plugin loaded`);
    return true;
  }

  initializeUI() {}

  openPluginWindow() {
    if (this.pluginWindow) return;
    this.render();
  }

  render() {}

  /**
   * Observer 예시
   * 지정된 요소가 변경될 때 실행되는 함수
   */
  startObserver() {
    // 이미 Observer가 존재할 경우, 기존 Observer 종료
    if (this.observer) this.observer.disconnect();

    // MutationObserver 사용
    // Observer가 발동될 경우, callback 함수 실행
    // eg) 100ms 후에 attachButton 함수 실행
    this.observer = new MutationObserver(() => {
      setTimeout(() => this.attachButton(), 100);
    });

    // Observer 설정
    // 지정한 HTML Element가 변경되는 것을 감지
    // eg) document.body 요소를 observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    // startObserver 함수 최초 실행 시, 500ms 후에 attachButton 함수 실행
    setTimeout(() => this.attachButton(), 500);
  }

  /**
   * 버거 버튼 내 버튼 추가 예시
   */
  attachButton() {
    // RisuAI 채팅 화면 중 우측 하단 햄버거 버튼 클릭 시 표시되는 메뉴 감지
    let burgerEl = document.querySelector(
      'div.right-2.bottom-16.p-5.bg-darkbg.flex.flex-col.gap-3.text-textcolor.rounded-md',
    );

    // 버거 버튼 내 버튼이 존재하지 않을 경우, 버튼 추가
    if (burgerEl && !burgerEl.classList.contains(`${PLUGIN_NAME}-btn-class`)) {
      // 여기에 버튼 추가 스크립트 작성
    }
  }

  // plugin이 unload될 때 호출되는 함수
  destroy() {
    if (this.observer) this.observer.disconnect();
    console.log(`${PLUGIN_NAME} 언로드`);
  }
}
