import React, { useEffect, useRef } from 'react';

import { PLUGIN_NAME } from '../../constants';
import { useInitialization } from '../contexts/InitializationContext.jsx';

// 메인 애플리케이션 컴포넌트
export function App() {
  const { risuAPI, isReady } = useInitialization();
  const observerRef = useRef(null);

  // UI 초기화 및 Observer 시작
  useEffect(() => {
    if (!isReady || !risuAPI) {
      return;
    }

    console.log(`[${PLUGIN_NAME}] plugin started`);

    // Observer 시작
    startObserver();

    // Cleanup: Observer 종료
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        console.log(`${PLUGIN_NAME} observer stopped`);
      }
    };
  }, [risuAPI, isReady]);

  /**
   * Observer 예시
   * 지정된 요소가 변경될 때 실행되는 함수
   */
  const startObserver = () => {
    // 이미 Observer가 존재할 경우, 기존 Observer 종료
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // MutationObserver 사용
    // Observer가 발동될 경우, callback 함수 실행
    // eg) 100ms 후에 attachButton 함수 실행
    observerRef.current = new MutationObserver(() => {
      setTimeout(() => attachButton(), 100);
    });

    // Observer 설정
    // 지정한 HTML Element가 변경되는 것을 감지
    // eg) document.body 요소를 observing
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    // startObserver 함수 최초 실행 시, 500ms 후에 attachButton 함수 실행
    setTimeout(() => attachButton(), 500);
  };

  /**
   * 버거 버튼 내 버튼 추가 예시
   */
  const attachButton = () => {
    // RisuAI 채팅 화면 중 우측 하단 햄버거 버튼 클릭 시 표시되는 메뉴 감지
    let burgerEl = document.querySelector(
      'div.right-2.bottom-16.p-5.bg-darkbg.flex.flex-col.gap-3.text-textcolor.rounded-md',
    );

    // 버거 버튼 내 버튼이 존재하지 않을 경우, 버튼 추가
    if (burgerEl && !burgerEl.classList.contains(`${PLUGIN_NAME}-btn-class`)) {
      // 여기에 버튼 추가 스크립트 작성
    }
  };

  // 이 컴포넌트는 UI를 렌더링하지 않고, Observer만 실행
  return null;
}
