/**
 * Initialization Core Logic
 * React 의존성이 없는 순수 초기화 로직
 */

/**
 * 개발 도구 설정
 * @param {Object} options
 * @param {string} options.pluginName - 플러그인 이름
 * @param {boolean} options.isDev - 개발 모드 여부
 * @returns {Promise<void>}
 */
export async function setupDevTools({ pluginName, isDev }) {
  if (!isDev) return;

  try {
    const { initHotReload } = await import('./dev-reload.js');
    initHotReload();
    console.log(`[${pluginName}] 🔥 Hot Reload enabled`);
  } catch (error) {
    console.warn(`[${pluginName}] Hot reload initialization failed:`, error);
  }
}

/**
 * RisuAPI 초기화
 * @param {Object} options
 * @param {string} options.pluginName - 플러그인 이름
 * @param {Object} options.pluginApis - 전역 __pluginApis__ 객체
 * @param {Function} options.RisuAPIClass - RisuAPI 클래스
 * @returns {Promise<Object|null>} RisuAPI 인스턴스 또는 null
 */
export async function initializeRisuApi({ pluginName, pluginApis, RisuAPIClass }) {
  const risuAPI = RisuAPIClass.getInstance(pluginApis);
  const initialized = await risuAPI.initialize();

  if (!initialized) {
    console.error(`[${pluginName}] Failed to initialize RisuAPI`);
    return null;
  }

  return risuAPI;
}

/**
 * React 루트 컨테이너 준비
 * @param {string} rootId - 루트 엘리먼트 ID
 * @returns {HTMLElement} 루트 컨테이너 엘리먼트
 */
export function ensureRootContainer(rootId) {
  let el = document.getElementById(rootId);
  if (!el) {
    el = document.createElement('div');
    el.id = rootId;
    document.body.appendChild(el);
  }
  return el;
}

/**
 * 루트 컨테이너 정리
 * @param {HTMLElement} container - 루트 컨테이너
 */
export function cleanupRootContainer(container) {
  if (container?.parentNode) {
    container.parentNode.removeChild(container);
  }
}
