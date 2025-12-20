<script>
  import { onDestroy, onMount } from 'svelte';
  import { debounce, isNil } from 'lodash';
  import { RisuAPI } from './core/risu-api.js';
  import { PLUGIN_NAME } from './constants.js';

  let risuAPI = $state(null);
  let observer = $state(null);

  // debounced 함수 생성
  const debouncedAttachButton = debounce(attachButton, 100);

  onMount(() => {
    risuAPI = RisuAPI.getInstance();

    if (isNil(risuAPI)) {
      console.log(`[${PLUGIN_NAME}] RisuAPI is not initialized`);
      return;
    }

    initializeUI();
    startObserver();
    console.log(`[${PLUGIN_NAME}] plugin loaded`);
  });

  onDestroy(() => {
    if (!isNil(observer)) {
      observer.disconnect();
    }
    debouncedAttachButton.cancel();
    console.log(`${PLUGIN_NAME} 언로드`);
  });

  function initializeUI() {
    // UI 초기화 로직을 여기에 작성
  }

  function startObserver() {
    if (!isNil(observer)) {
      observer.disconnect();
    }

    observer = new MutationObserver(() => {
      debouncedAttachButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    debouncedAttachButton();
  }

  function attachButton() {
    // RisuAI 채팅 화면 중 우측 하단 햄버거 버튼 클릭 시 표시되는 메뉴 감지
    const burgerEl = document.querySelector(
      'div.right-2.bottom-16.p-5.bg-darkbg.flex.flex-col.gap-3.text-textcolor.rounded-md',
    );

    if (!isNil(burgerEl) && !burgerEl.classList.contains(`${PLUGIN_NAME}-btn-class`)) {
      // 여기에 버튼 추가 스크립트 작성
    }
  }
</script>

<!-- 메인 앱 컴포넌트 -->
<!-- 필요한 UI를 여기에 추가하세요 -->
