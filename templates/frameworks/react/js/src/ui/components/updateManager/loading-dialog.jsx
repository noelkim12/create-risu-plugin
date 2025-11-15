/**
 * LoadingDialog React Component
 * 업데이트 처리 중 표시되는 로딩 다이얼로그 컴포넌트
 */

import React from 'react';
import ReactDOM from 'react-dom/client';

import { updateDialogStyles as s } from '../../styles/index.js';

export function LoadingDialog({ message = '업데이트를 처리하고 있습니다...' }) {
  return (
    <div className={s.udRoot} role="dialog" aria-modal="true" aria-busy="true">
      <div className={`${s.udCard} ${s.udLoading}`} data-loading-card>
        <div className={s.udLoadingSpinner}>
          <svg className={s.udLoadingSvg} viewBox="0 0 50 50">
            <circle
              className={s.udLoadingCircle}
              cx="25"
              cy="25"
              r="20"
              fill="none"
              strokeWidth="4"
            />
          </svg>
        </div>
        <div className={s.udLoadingMessage}>{message}</div>
      </div>
    </div>
  );
}

/**
 * LoadingDialog를 표시하고 지정된 시간 후 자동으로 닫음
 * @param {string} message - 표시할 메시지
 * @param {number} [duration=3000] - 표시 시간 (밀리초)
 * @returns {Promise<void>}
 */
export function showLoading(message = '업데이트를 처리하고 있습니다...', duration = 3000) {
  return new Promise(resolve => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = ReactDOM.createRoot(container);
    root.render(<LoadingDialog message={message} />);

    setTimeout(() => {
      root.unmount();
      document.body.removeChild(container);
      resolve();
    }, duration);
  });
}
