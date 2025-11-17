/**
 * Update Core Logic
 * React 의존성이 없는 순수 업데이트 로직
 */

import { parsePluginScript, scriptUpdater } from './script-updater.js';

/**
 * unpkg에서 최신 버전의 메타데이터를 파싱
 * @param {string} pluginName - 플러그인 이름
 * @returns {Promise<Object|null>} manifest 객체 또는 null
 */
export async function fetchLatestManifest(pluginName) {
  try {
    const url = `https://unpkg.com/${pluginName}@latest/dist/${pluginName}.js`;

    // HEAD 요청으로 redirect된 최종 URL 확인
    const headResponse = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
    });

    // 실제 resolved 버전 확인
    const resolvedUrl = headResponse.url;
    const versionMatch = resolvedUrl.match(/@([\d.]+)\//);

    if (!versionMatch) {
      throw new Error('Version not found in resolved URL');
    }

    const latestVersion = versionMatch[1];

    // 실제 파일 내용에서 배너 메타데이터 추출
    const content = await fetch(resolvedUrl).then(r => r.text());
    const bannerRegex =
      /\/\/@name (.+?)\n\/\/@display-name (.+?)\n\/\/@version (.+?)\n\/\/@description (.+?)(?:\n|$)/;
    const bannerMatch = content.match(bannerRegex);

    // 릴리즈 노트 가져오기
    const notesUrl = `https://unpkg.com/${pluginName}@${latestVersion}/dist/release-notes.json`;
    let releaseData = {};

    try {
      const notesResponse = await fetch(notesUrl);
      if (notesResponse.ok) {
        const allNotes = await notesResponse.json();
        releaseData = allNotes[latestVersion] || {};
      }
    } catch (error) {
      console.warn('[UpdateCore] Failed to fetch release notes:', error);
    }

    return {
      version: latestVersion,
      url: resolvedUrl,
      name: bannerMatch?.[1]?.trim() || pluginName,
      displayName: bannerMatch?.[2]?.trim() || `${pluginName}_v${latestVersion}`,
      description: bannerMatch?.[4]?.trim() || '',
      mandatory: releaseData.mandatory || false,
      notes: releaseData.notes || [],
      released_at: releaseData.released_at || new Date().toISOString(),
    };
  } catch (error) {
    console.error('[UpdateCore] Failed to fetch manifest:', error);
    return null;
  }
}

/**
 * 버전 비교 (semver 기반)
 * @param {string} v1 - 비교할 버전 1
 * @param {string} v2 - 비교할 버전 2
 * @returns {number} v1 > v2: 1, v1 < v2: -1, v1 === v2: 0
 */
export function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * 업데이트 필요 여부 확인
 * @param {string} latestVersion - 최신 버전
 * @param {string} currentVersion - 현재 버전
 * @returns {boolean} 업데이트 필요 여부
 */
export function isUpdateNeeded(latestVersion, currentVersion) {
  return compareVersions(latestVersion, currentVersion) > 0;
}

/**
 * Skip 버전 가져오기
 * @param {string} pluginName - 플러그인 이름
 * @returns {string|null} skip된 버전 또는 null
 */
export function getSkipVersion(pluginName) {
  const skipKey = `${pluginName}_skip_version`;
  return localStorage.getItem(skipKey);
}

/**
 * Skip 버전 설정
 * @param {string} pluginName - 플러그인 이름
 * @param {string} version - skip할 버전
 */
export function setSkipVersion(pluginName, version) {
  const skipKey = `${pluginName}_skip_version`;
  localStorage.setItem(skipKey, version);
}

/**
 * Skip 버전 확인
 * @param {string} pluginName - 플러그인 이름
 * @param {string} latestVersion - 최신 버전
 * @returns {boolean} skip된 버전인지 여부
 */
export function isVersionSkipped(pluginName, latestVersion) {
  const skipVersion = getSkipVersion(pluginName);
  return skipVersion === latestVersion;
}

/**
 * 플러그인 스크립트 업데이트
 * @param {Object} manifest - fetchLatestManifest()로 가져온 매니페스트
 * @returns {Promise<Object>} {success: boolean, error?: Error}
 */
export async function updatePluginScript(manifest) {
  try {
    console.log('[UpdateCore] Fetching latest script from unpkg:', manifest.url);
    const scriptContent = await fetch(manifest.url).then(r => r.text());

    console.log('[UpdateCore] Parsing plugin script...');
    const parsed = parsePluginScript(scriptContent);

    return scriptUpdater(parsed);
  } catch (error) {
    console.error('[UpdateCore] Plugin update failed:', error);
    return { success: false, error };
  }
}
