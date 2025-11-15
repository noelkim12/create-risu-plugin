/**
 * AlertDialog React Component
 * 간단한 알림 메시지를 표시하는 다이얼로그 컴포넌트
 */

import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

import { updateDialogStyles as s } from '../../styles/index.js';

export function AlertDialog({ message = '', confirmText = '확인', onConfirm }) {
  const confirmButtonRef = useRef(null);

  // 포커스 설정 및 키보드 이벤트 리스너
  useEffect(() => {
    // 확인 버튼에 포커스
    confirmButtonRef.current?.focus();

    // 키보드 이벤트 핸들러
    const onKey = e => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        handleConfirm();
      }
    };

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
  };

  return (
    <div className={s.udRoot} role="dialog" aria-modal="true">
      <div className={`${s.udCard} ${s.udAlert}`} data-alert-card>
        <div className={s.udAlertMessage}>{message}</div>
        <div className={s.udActions}>
          <button ref={confirmButtonRef} className={s.udBtnPrimary} onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * AlertDialog를 표시하고 사용자 확인을 기다림
 * @param {string} message - 표시할 메시지
 * @param {string} [confirmText="확인"] - 확인 버튼 텍스트
 * @returns {Promise<void>}
 */
export function showAlert(message, confirmText = '확인') {
  return new Promise(resolve => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = ReactDOM.createRoot(container);

    const handleConfirm = () => {
      root.unmount();
      document.body.removeChild(container);
      resolve();
    };

    root.render(<AlertDialog message={message} confirmText={confirmText} onConfirm={handleConfirm} />);
  });
}
