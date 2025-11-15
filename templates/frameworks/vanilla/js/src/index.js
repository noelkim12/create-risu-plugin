import './ui/styles'; // Style Registry
import './ui/components'; // Web Components 레지스트리

import { PLUGIN_NAME, PLUGIN_VERSION } from './constants.js';
import { RisuAPI } from './core/risu-api.js';
import { checkForUpdates } from './core/update-manager.js';
import { App } from './ui/components/main.js';

// 애플리케이션 실행
(async () => {
  if (__DEV_MODE__) {
    import('./core/dev-reload.js')
      .then(({ initHotReload }) => {
        initHotReload();
        console.log(`[${PLUGIN_NAME}] 🔥 Hot Reload enabled`);
      })
      .catch(error => {
        console.warn('[App] Hot reload initialization failed:', error);
      });
  }
  try {
    const risuAPI = RisuAPI.getInstance(globalThis.__pluginApis__);
    const initialized = await risuAPI.initialize();

    if (!initialized) {
      console.error(`[${PLUGIN_NAME}] Failed to initialize RisuAPI`);
      return;
    }

    checkForUpdates({ silent: true }).catch(err => {
      console.warn('[App] Update check failed:', err);
    });

    const app = new App();
    await app.initialize();

    console.log(`${PLUGIN_NAME} v${PLUGIN_VERSION} loaded`);

    risuAPI.onUnload(() => {
      app.destroy();
    });
  } catch (error) {
    console.error(`[${PLUGIN_NAME}] Initialization failed:`, error);
  }
})();
