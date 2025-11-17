/**
 * Update Domain Models
 * 업데이트 관련 도메인 객체 생성 헬퍼
 */

/**
 * 업데이트 정보 객체 생성
 * @param {Object} params
 * @param {string} params.name - 플러그인 이름
 * @param {string} params.currentVersion - 현재 버전
 * @param {Object} params.manifest - fetchLatestManifest()로 가져온 매니페스트
 * @returns {UpdateInfo} 업데이트 정보 객체
 */
export function createUpdateInfo({ name, currentVersion, manifest }) {
  return {
    name,
    currentVersion,
    latestVersion: manifest.version,
    mandatory: manifest.mandatory === true,
    releasedAt: manifest.released_at || new Date().toISOString(),
    notes: manifest.notes || [],
    url: manifest.url,
  };
}

/**
 * 업데이트 UI 텍스트 객체 생성
 * @param {Object} i18n - 사용자 정의 텍스트 (선택)
 * @returns {UpdateTexts} i18n 텍스트 객체
 */
export function createUpdateTexts(i18n = {}) {
  const defaults = {
    title: '플러그인 업데이트 준비 완료',
    primary: '지금 업데이트',
    later: '나중에',
    skip: '이번 버전 건너뛰기',
  };
  return { ...defaults, ...i18n };
}
