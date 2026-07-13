import { ProjectConfig } from "./core/ProjectConfig.js";
import { ProjectGenerator } from "./core/ProjectGenerator.js";
import { promptProjectName, promptDescription, promptCheckNpm, promptRename } from "./prompts/basePrompts.js";
import { promptFramework, promptFeatures } from "./prompts/frameworkPrompts.js";
import { showWelcome, showSuccess, showNextSteps, showError, showNpmExplanation } from "./utils/messages.js";
import { checkNpmPackageExists, getNpmPackageInfo } from "./utils/npm.js";
import { toPascalCase, validateProjectName } from "./utils/validators.js";

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
 * Build a project configuration from collected prompt values.
 */
export function buildProjectConfig({ projectName, description, framework, features = [] }) {
  return new ProjectConfig()
    .setProjectName(projectName)
    .setDescription(description)
    .setFramework(framework)
    .setFeatures(features);
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

    // Step 3: Select framework
    const framework = await promptFramework();
    const features = await promptFeatures();

    // Step 4: Build configuration
    const config = buildProjectConfig({
      projectName,
      description,
      framework,
      features
    });

    // Step 5: Generate project
    const generator = new ProjectGenerator(config);
    await generator.generate();

    // Step 6: Show success message
    showSuccess();
    showNextSteps(projectName);

  } catch (error) {
    showError(`\n에러 발생: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Non-interactive project creation for programmatic callers (e.g. risuai-workbench).
 * No prompts, no npm-registry conflict check.
 *
 * @param {{projectName: string, description?: string, framework?: string, targetDir?: string, skipInstall?: boolean}} options
 * @throws {Error} On invalid name/framework or generation failure
 */
export async function createProjectFromOptions(options) {
  const nameValidation = validateProjectName(options.projectName);
  if (nameValidation !== true) {
    throw new Error(nameValidation);
  }

  const config = new ProjectConfig()
    .setProjectName(options.projectName)
    .setDescription(options.description?.trim() || `${toPascalCase(options.projectName)} for RISU AI`)
    .setFramework(options.framework ?? "vanilla");

  if (options.targetDir) {
    config.setTargetDir(options.targetDir);
  }

  const generator = new ProjectGenerator(config, { skipInstall: options.skipInstall === true });
  await generator.generate();

  showSuccess();
  console.log(`created: ${config.targetDir}`);
}
