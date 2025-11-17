/**
 * Update Manager
 * 업데이트 확인 UI 로직 (React)
 */

import React from 'react';
import { renderDialog } from '../ui/utils/dialog-root.js';
import { UpdateDialog } from '../ui/components/updateManager/update-dialog.jsx';

/**
 * 업데이트 확인 다이얼로그 표시
 * @param {Object} params
 * @param {Object} params.info - UpdateInfo 객체 (createUpdateInfo로 생성)
 * @param {Object} params.texts - UpdateTexts 객체 (createUpdateTexts로 생성)
 * @returns {Promise<Object>} { action: 'update'|'later'|'skip', skipVersion?: string }
 */
export async function confirmUpdate({ info, texts }) {
  const detail = await renderDialog(<UpdateDialog info={info} texts={texts} />);

  // 결과 구성
  const { action, skipVersion } = detail;
  const result = { action };

  if (action === 'update') {
    result.url = info.url;
  } else if (action === 'skip') {
    result.skipVersion = skipVersion;
  }

  return result;
}
