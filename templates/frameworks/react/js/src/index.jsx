import React from 'react';
import ReactDOM from 'react-dom/client';

import './ui/styles';

import { PLUGIN_NAME, PLUGIN_VERSION } from './constants.js';
import { RisuAPI } from './core/risu-api.js';
import { checkForUpdates } from './core/update-manager.jsx';
import { App } from './ui/components/main.jsx';

const ROOT_ID = 'risu-plugin-root';

/**
 * 개발 도구 설정
 */
async function setupDevTools() {
  if (__DEV_MODE__) {
    try {
      const { initHotReload } = await import('./core/dev-reload.js');
      initHotReload();
      console.log(`[${PLUGIN_NAME}] 🔥 Hot Reload enabled`);
    } catch (error) {
      console.warn('[App] Hot reload initialization failed:', error);
    }
  }
}

/**
 * RisuAPI 초기화
 * @returns {Promise<RisuAPI|null>}
 */
async function initRisuApi() {
  const risuAPI = RisuAPI.getInstance(globalThis.__pluginApis__);
  const initialized = await risuAPI.initialize();

  if (!initialized) {
    console.error(`[${PLUGIN_NAME}] Failed to initialize RisuAPI`);
    return null;
  }

  return risuAPI;
}

/**
 * React 루트 컨테이너 준비
 * @returns {HTMLElement}
 */
function ensureRootContainer() {
  let el = document.getElementById(ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}

/**
 * 애플리케이션 진입점
 */
async function main() {
  try {
    await setupDevTools();

    const risuAPI = await initRisuApi();
    if (!risuAPI) return;

    // 업데이트 체크는 사이드이펙트라 fire-and-forget
    checkForUpdates({ silent: true }).catch(err => {
      console.warn('[App] Update check failed:', err);
    });

    const container = ensureRootContainer();
    const root = ReactDOM.createRoot(container);

    root.render(
      <React.StrictMode>
        <App risuAPI={risuAPI} />
      </React.StrictMode>,
    );

    console.log(`${PLUGIN_NAME} v${PLUGIN_VERSION} loaded`);

    risuAPI.onUnload(() => {
      root.unmount();
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    });
  } catch (error) {
    console.error(`[${PLUGIN_NAME}] Initialization failed:`, error);
  }
}

main();
