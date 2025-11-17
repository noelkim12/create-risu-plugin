/**
 * Update Context & Provider
 * 업데이트 관리 Context와 Hook 제공
 */

import React, { createContext, useContext, useCallback } from 'react';
import {
  fetchLatestManifest,
  isUpdateNeeded,
  isVersionSkipped,
  setSkipVersion,
  updatePluginScript,
} from '../../core/update-core.js';
import { createUpdateInfo, createUpdateTexts } from '../../core/update-types.js';
import { showAlert, showLoading } from '../components/updateManager/alert-dialog.jsx';
import { confirmUpdate } from '../../core/update-manager.jsx';

const UpdateContext = createContext(null);

/**
 * UpdateProvider 컴포넌트
 * @param {Object} props
 * @param {React.ReactNode} props.children
 */
export function UpdateProvider({ children }) {
  /**
   * 업데이트 확인 및 처리
   * @param {Object} options
   * @param {string} options.pluginName - 플러그인 이름
   * @param {string} options.currentVersion - 현재 버전
   * @param {Object} [options.i18n] - i18n 텍스트 (선택)
   * @param {boolean} [options.silent] - 사일런트 모드 (선택)
   */
  const checkForUpdates = useCallback(async ({ pluginName, currentVersion, i18n, silent = false }) => {
    try {
      // 1. 최신 매니페스트 가져오기
      const manifest = await fetchLatestManifest(pluginName);
      if (!manifest) {
        if (!silent) {
          await showAlert('업데이트 정보를 가져올 수 없습니다.');
        }
        return;
      }

      // 2. 업데이트 필요 여부 확인
      if (!isUpdateNeeded(manifest.version, currentVersion)) {
        if (!silent) {
          await showAlert('이미 최신 버전입니다.');
        }
        return;
      }

      // 3. Skip 여부 확인
      if (!manifest.mandatory && isVersionSkipped(pluginName, manifest.version)) {
        return; // Skip된 버전이면 조용히 종료
      }

      // 4. 도메인 객체 생성
      const info = createUpdateInfo({ name: pluginName, currentVersion, manifest });
      const texts = createUpdateTexts(i18n);

      // 5. 사용자에게 확인
      const result = await confirmUpdate({ info, texts });

      // 6. 사용자 액션 처리
      if (result.action === 'update') {
        await showLoading('업데이트를 적용하고 있습니다...', 1500);
        const updateResult = await updatePluginScript(manifest);

        if (updateResult.success) {
          await showAlert('업데이트가 완료되었습니다. 페이지를 새로고침하세요.');
        } else {
          await showAlert('업데이트 중 오류가 발생했습니다.');
        }
      } else if (result.action === 'skip' && result.skipVersion) {
        setSkipVersion(pluginName, result.skipVersion);
      }
      // 'later' 액션은 아무것도 하지 않음
    } catch (error) {
      console.error('[UpdateContext] Update check failed:', error);
      if (!silent) {
        await showAlert('업데이트 확인 중 오류가 발생했습니다.');
      }
    }
  }, []);

  const value = { checkForUpdates };

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

/**
 * useUpdateManager Hook
 * @returns {{ checkForUpdates: Function }}
 */
export function useUpdateManager() {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useUpdateManager must be used within UpdateProvider');
  }
  return context;
}
