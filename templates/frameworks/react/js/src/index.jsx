import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';

import './ui/styles';

import { PLUGIN_NAME, PLUGIN_VERSION } from './constants.js';
import { ensureRootContainer, cleanupRootContainer } from './core/initialization-core.js';
import { InitializationProvider, useInitialization } from './ui/contexts/InitializationContext.jsx';
import { UpdateProvider, useUpdateManager } from './ui/contexts/UpdateContext.jsx';
import { cleanupDialogRoot } from './ui/utils/dialog-root.js';
import { App } from './ui/components/main.jsx';

const ROOT_ID = 'risu-plugin-root';

/**
 * UpdateChecker Component
 * 앱 시작 시 자동으로 업데이트 체크
 */
function UpdateChecker() {
  const { checkForUpdates } = useUpdateManager();

  useEffect(() => {
    checkForUpdates({
      pluginName: PLUGIN_NAME,
      currentVersion: PLUGIN_VERSION,
      silent: true,
    }).catch(err => {
      console.warn('[UpdateChecker] Update check failed:', err);
    });
  }, [checkForUpdates]);

  return null;
}

/**
 * Cleanup Component
 * risuAPI unload 시 정리 작업 수행
 */
function Cleanup({ container, root }) {
  const { risuAPI, isReady } = useInitialization();

  useEffect(() => {
    if (!isReady || !risuAPI) return;

    risuAPI.onUnload(() => {
      root.unmount();
      cleanupDialogRoot();
      cleanupRootContainer(container);
    });
  }, [risuAPI, isReady, container, root]);

  return null;
}

/**
 * 애플리케이션 진입점
 */
function main() {
  const container = ensureRootContainer(ROOT_ID);
  const root = ReactDOM.createRoot(container);

  root.render(
    <React.StrictMode>
      <InitializationProvider
        pluginName={PLUGIN_NAME}
        pluginVersion={PLUGIN_VERSION}
        isDev={__DEV_MODE__}
      >
        <UpdateProvider>
          <UpdateChecker />
          <Cleanup container={container} root={root} />
          <App />
        </UpdateProvider>
      </InitializationProvider>
    </React.StrictMode>,
  );
}

main();
