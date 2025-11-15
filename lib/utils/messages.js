import chalk from "chalk";

/**
 * UI message utilities
 */

/**
 * Display welcome banner
 */
export function showWelcome() {
  console.log(chalk.cyan("🌮 Risu Plugin Scaffold Builder 🥠\n"));
}

/**
 * Display error message and exit
 * @param {string} message - Error message
 */
export function showError(message) {
  console.log(chalk.red(`❌ ${message}`));
}

/**
 * Display info message
 * @param {string} message - Info message
 */
export function showInfo(message) {
  console.log(chalk.yellow(`📦 ${message}`));
}

/**
 * Display success message
 */
export function showSuccess() {
  console.log(chalk.green("\n✅ 프로젝트 생성 완료!\n"));
}

/**
 * Display next steps
 * @param {string} projectName - Name of the created project
 */
export function showNextSteps(projectName) {
  console.log(chalk.cyan("다음 단계:"));
  console.log(chalk.white(`  1. cd ${projectName}`));
  console.log(chalk.white(`  2. npm run dev     ${chalk.gray("# 개발 모드 (Hot Reload)")}`));
  console.log(chalk.white(`  3. npm run build   ${chalk.gray("# 프로덕션 빌드")}\n`));
}
