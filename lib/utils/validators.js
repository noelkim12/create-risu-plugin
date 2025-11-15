/**
 * Validation utilities for project creation
 */

/**
 * Validate kebab-case format
 * @param {string} name - Project name to validate
 * @returns {boolean} True if valid kebab-case
 */
export function isValidKebabCase(name) {
  // 영문 소문자, 숫자, 하이픈만 허용, 하이픈으로 시작/끝나면 안됨
  const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
  return kebabCaseRegex.test(name);
}

/**
 * Convert kebab-case to PascalCase with spaces
 * @param {string} kebabStr - Kebab-case string
 * @returns {string} PascalCase string with spaces
 */
export function toPascalCase(kebabStr) {
  return kebabStr
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Validate project name with kebab-case format
 * @param {string} input - User input to validate
 * @returns {boolean|string} True if valid, error message if invalid
 */
export function validateProjectName(input) {
  if (!input || input.trim() === "") {
    return "프로젝트 이름은 필수입니다.";
  }
  if (!isValidKebabCase(input)) {
    return "kebab-case 형식으로 입력하세요 (예: my-risu-plugin)\n영문 소문자, 숫자, 하이픈(-)만 사용 가능하며, 하이픈으로 시작하거나 끝날 수 없습니다.";
  }
  return true;
}
