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
  console.log(chalk.white(`  2. npm run mock    ${chalk.gray("# Risuai 없이 브라우저 미리보기")}`));
  console.log(chalk.white(`  3. npm run dev     ${chalk.gray("# Risuai용 빌드 감시 (Hot Reload)")}`));
  console.log(chalk.white(`  4. npm run build   ${chalk.gray("# 프로덕션 빌드")}\n`));
}

/**
 * Display NPM explanation before package name check
 */
export function showNpmExplanation() {
  console.log(chalk.cyan("\n📦 NPM (Node Package Manager)이란?"));
  console.log(chalk.white("  NPM은 JavaScript 패키지를 공유하고 관리하는 세계 최대 소프트웨어 레지스트리입니다."));
  console.log(chalk.white("  플러그인을 NPM에 배포(publish)하면:"));
  console.log(chalk.green("    ✓ 사용자가 자동 업데이트 기능을 이용할 수 있습니다"));
  console.log(chalk.green("    ✓ npm install 명령어로 쉽게 설치할 수 있습니다"));
  console.log(chalk.green("    ✓ 버전 관리와 배포가 자동화됩니다\n"));
  console.log(chalk.yellow("  💡 NPM에 배포할 계획이라면, 패키지 이름 중복 여부를 미리 확인하는 것이 좋습니다.\n"));
}
