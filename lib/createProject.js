import { ProjectConfig } from "./core/ProjectConfig.js";
import { ProjectGenerator } from "./core/ProjectGenerator.js";
import { promptProjectName, promptDescription, promptCheckNpm, promptRename } from "./prompts/basePrompts.js";
import { promptFramework, promptLanguage } from "./prompts/frameworkPrompts.js";
import {
  promptWebSocketPort,
  promptCaddy,
  promptCaddyDomain,
  promptCaddyEmail
} from "./prompts/devServerPrompts.js";
import { showWelcome, showSuccess, showNextSteps, showError, showNpmExplanation } from "./utils/messages.js";
import { checkNpmPackageExists, getNpmPackageInfo } from "./utils/npm.js";

/**
 * Collect project name with NPM conflict check
 * @returns {Promise<{projectName: string, description: string}>}
 */
async function collectProjectInfo() {
  while (true) {
    // Step 2-1: Get project name
    const projectName = await promptProjectName();
    const description = await promptDescription(projectName);

    // Step 2-2: Show NPM explanation and ask if user wants to check NPM
    showNpmExplanation();
    const shouldCheckNpm = await promptCheckNpm();

    if (!shouldCheckNpm) {
      // User doesn't want to check NPM, proceed
      return { projectName, description };
    }

    // Step 2-3: Check NPM registry
    console.log(`\n🔍 NPM 레지스트리 확인 중...`);
    const packageExists = await checkNpmPackageExists(projectName);

    if (!packageExists) {
      // Package name is available
      console.log(`✅ '${projectName}' 패키지 이름을 사용할 수 있습니다.\n`);
      return { projectName, description };
    }

    // Step 2-4: Package exists, show info and ask for rename
    const packageInfo = await getNpmPackageInfo(projectName);
    if (packageInfo) {
      console.log(`\n📦 기존 패키지 정보:`);
      console.log(`   이름: ${packageInfo.name}`);
      console.log(`   버전: ${packageInfo.version}`);
      console.log(`   설명: ${packageInfo.description}`);
      console.log(`   작성자: ${packageInfo.author}\n`);
    }

    const shouldRename = await promptRename(projectName);

    if (!shouldRename) {
      // User wants to proceed with conflicting name
      console.log(`⚠️  동일한 이름으로 프로젝트를 생성합니다.\n`);
      return { projectName, description };
    }

    // User wants to rename, loop back to Step 2-1
    console.log(`\n🔄 다시 프로젝트 이름을 입력해주세요.\n`);
  }
}

/**
 * Main entry point for project creation
 * Orchestrates user prompts and project generation
 */
export async function createProject() {
  try {
    // Step 1: Show welcome message
    showWelcome();

    // Step 2: Collect basic project info with NPM check
    const { projectName, description } = await collectProjectInfo();

    // Step 3: Select framework and language
    const framework = await promptFramework();
    const language = await promptLanguage();

    // Step 4: WebSocket port configuration
    const websocketPort = await promptWebSocketPort();

    // Step 5: Caddy configuration
    const useCaddy = await promptCaddy();
    let caddyDomain = "";
    let caddyEmail = "";

    if (useCaddy) {
      caddyDomain = await promptCaddyDomain();
      caddyEmail = await promptCaddyEmail();
    }

    // Step 6: Build configuration
    const config = new ProjectConfig()
      .setProjectName(projectName)
      .setDescription(description)
      .setFramework(framework)
      .setLanguage(language)
      .setWebSocketPort(websocketPort)
      .setCaddy(useCaddy, caddyDomain, caddyEmail);

    // Step 7: Generate project
    const generator = new ProjectGenerator(config);
    await generator.generate();

    // Step 8: Show success message
    showSuccess();
    showNextSteps(projectName);

  } catch (error) {
    showError(`\n에러 발생: ${error.message}`);
    process.exit(1);
  }
}
