import React from 'react';
import ReactDOM from 'react-dom/client';

/**
 * Singleton Dialog Root Manager
 * 모든 다이얼로그가 공유하는 단일 React Root를 관리합니다.
 */

// Singleton state
let dialogRoot = null;
let dialogContainer = null;

/**
 * 싱글톤 다이얼로그 루트를 가져오거나 생성
 * @returns {{ root: ReactDOM.Root, container: HTMLElement }}
 */
function getDialogRoot() {
  if (!dialogRoot) {
    dialogContainer = document.createElement('div');
    dialogContainer.id = 'risu-plugin-dialog-root';
    document.body.appendChild(dialogContainer);
    dialogRoot = ReactDOM.createRoot(dialogContainer);
  }
  return { root: dialogRoot, container: dialogContainer };
}

/**
 * 현재 렌더링된 다이얼로그 클리어
 */
function clearDialog() {
  if (dialogRoot) {
    dialogRoot.render(null);
  }
}

/**
 * 싱글톤 루트를 사용하여 다이얼로그 컴포넌트 렌더링
 * @param {React.ReactElement} element - 렌더링할 다이얼로그 컴포넌트
 * @returns {Promise<any>} 다이얼로그 완료 시 resolve되는 Promise
 */
export function renderDialog(element) {
  return new Promise(resolve => {
    const { root } = getDialogRoot();

    // 완료 핸들러를 주입한 element 생성
    const elementWithCleanup = React.cloneElement(element, {
      onDialogComplete: result => {
        clearDialog();
        resolve(result);
      },
    });

    root.render(elementWithCleanup);
  });
}

/**
 * 다이얼로그 루트 정리 (플러그인 언로드 시)
 */
export function cleanupDialogRoot() {
  if (dialogRoot) {
    dialogRoot.unmount();
    if (dialogContainer?.parentNode) {
      dialogContainer.parentNode.removeChild(dialogContainer);
    }
    dialogRoot = null;
    dialogContainer = null;
  }
}
