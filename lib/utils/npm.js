/**
 * NPM Registry utilities
 * Check package availability on NPM registry
 */

/**
 * Check if a package exists on NPM registry
 * @param {string} packageName - Package name to check
 * @returns {Promise<boolean>} True if package exists, false otherwise
 */
export async function checkNpmPackageExists(packageName) {
  try {
    const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const response = await fetch(registryUrl);

    // 200: Package exists
    // 404: Package not found
    return response.status === 200;
  } catch (error) {
    // Network error or other issues - assume package doesn't exist
    console.warn(`NPM 체크 중 오류 발생: ${error.message}`);
    return false;
  }
}

/**
 * Get package info from NPM registry
 * @param {string} packageName - Package name
 * @returns {Promise<Object|null>} Package info or null if not found
 */
export async function getNpmPackageInfo(packageName) {
  try {
    const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const response = await fetch(registryUrl);

    if (response.status === 200) {
      const data = await response.json();
      return {
        name: data.name,
        version: data['dist-tags']?.latest || 'unknown',
        description: data.description || '',
        author: data.author?.name || data.maintainers?.[0]?.name || 'unknown'
      };
    }

    return null;
  } catch (error) {
    console.warn(`NPM 패키지 정보 조회 중 오류 발생: ${error.message}`);
    return null;
  }
}
