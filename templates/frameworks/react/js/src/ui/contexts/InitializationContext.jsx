/**
 * Initialization Context & Provider
 * 플러그인 초기화 Context와 Hook 제공
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { setupDevTools, initializeRisuApi } from '../../core/initialization-core.js';
import { RisuAPI } from '../../core/risu-api.js';

const InitializationContext = createContext(null);

/**
 * InitializationProvider 컴포넌트
 * @param {Object} props
 * @param {string} props.pluginName - 플러그인 이름
 * @param {string} props.pluginVersion - 플러그인 버전
 * @param {boolean} props.isDev - 개발 모드 여부
 * @param {React.ReactNode} props.children
 */
export function InitializationProvider({ pluginName, pluginVersion, isDev, children }) {
  const [risuAPI, setRisuAPI] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function initialize() {
      try {
        // 1. 개발 도구 설정
        await setupDevTools({ pluginName, isDev });

        // 2. RisuAPI 초기화
        const api = await initializeRisuApi({
          pluginName,
          pluginApis: globalThis.__pluginApis__,
          RisuAPIClass: RisuAPI,
        });

        if (!api) {
          throw new Error('RisuAPI initialization failed');
        }

        setRisuAPI(api);
        setIsReady(true);

        console.log(`${pluginName} v${pluginVersion} loaded`);
      } catch (err) {
        console.error(`[${pluginName}] Initialization failed:`, err);
        setError(err);
      }
    }

    initialize();
  }, [pluginName, pluginVersion, isDev]);

  const value = {
    risuAPI,
    isReady,
    error,
  };

  return <InitializationContext.Provider value={value}>{children}</InitializationContext.Provider>;
}

/**
 * useInitialization Hook
 * @returns {{ risuAPI: Object|null, isReady: boolean, error: Error|null }}
 */
export function useInitialization() {
  const context = useContext(InitializationContext);
  if (!context) {
    throw new Error('useInitialization must be used within InitializationProvider');
  }
  return context;
}
