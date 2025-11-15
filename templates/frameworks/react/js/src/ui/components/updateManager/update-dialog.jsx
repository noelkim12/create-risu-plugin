/**
 * UpdateDialog React Component
 * 플러그인 업데이트 확인 다이얼로그 컴포넌트
 */

import React, { useEffect, useRef } from 'react';

import { updateDialogStyles as s } from '../../styles/index.js';

export function UpdateDialog({
  name = '',
  currentVersion = '0.0.0',
  version = '0.0.0',
  releasedAt = new Date().toISOString(),
  mandatory = false,
  notes = [],
  title = '플러그인 업데이트 준비 완료',
  btnUpdate = '지금 업데이트',
  btnLater = '나중에',
  btnSkip = '이번 버전 건너뛰기',
  onAction,
}) {
  const updateButtonRef = useRef(null);

  // 포커스 설정 및 키보드 이벤트 리스너
  useEffect(() => {
    // 업데이트 버튼에 포커스
    updateButtonRef.current?.focus();

    // 키보드 이벤트 핸들러
    const onKey = e => {
      if (e.key === 'Escape' && !mandatory) {
        handleAction('later');
      }
      if (e.key === 'Enter') {
        handleAction('update');
      }
    };

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [mandatory]);

  const handleAction = action => {
    const detail = { action };

    if (action === 'skip') {
      detail.skipVersion = version;
    }

    // 콜백 함수 호출
    if (onAction) {
      onAction(detail);
    }
  };

  const handleBackgroundClick = e => {
    if (!mandatory && e.target === e.currentTarget) {
      handleAction('later');
    }
  };

  const releasedDate = new Date(releasedAt).toLocaleDateString();
  const updateType = mandatory ? '필수 업데이트' : '선택 업데이트';

  const notesList =
    notes.length > 0
      ? notes.slice(0, 8).map((n, idx) => {
          const typeClass =
            n.type && s[`ud${n.type.charAt(0).toUpperCase()}${n.type.slice(1)}`]
              ? s[`ud${n.type.charAt(0).toUpperCase()}${n.type.slice(1)}`]
              : '';
          return (
            <li key={idx} className={typeClass}>
              {n.text || ''}
            </li>
          );
        })
      : [<li key="default">세부 변경사항은 릴리스 노트를 참고해주세요</li>];

  return (
    <div
      className={s.udRoot}
      role="dialog"
      aria-modal="true"
      onClick={handleBackgroundClick}
    >
      <div className={s.udCard} data-update-card>
        <div className={s.udTitle}>
          <h3>
            {title}
            {name ? ` · ${name}` : ''}
          </h3>
          <span className={s.udPill}>
            v{currentVersion} → v{version}
          </span>
        </div>
        <div className={s.udSub}>
          {releasedDate} · {updateType}
        </div>
        <ul className={s.udList} aria-label="변경사항">
          {notesList}
        </ul>
        <div className={s.udActions}>
          {!mandatory && (
            <button className={s.udBtnGhost} onClick={() => handleAction('later')}>
              {btnLater}
            </button>
          )}
          {!mandatory && (
            <button className={s.udBtnGhost} onClick={() => handleAction('skip')}>
              {btnSkip}
            </button>
          )}
          <button
            ref={updateButtonRef}
            className={s.udBtnPrimary}
            onClick={() => handleAction('update')}
          >
            {btnUpdate}
          </button>
        </div>
      </div>
    </div>
  );
}
