import inquirer from "inquirer";
import { validateProjectName, toPascalCase } from "../utils/validators.js";

/**
 * Prompt for project name
 * @returns {Promise<string>} Project name
 */
export async function promptProjectName() {
  const { projectName } = await inquirer.prompt([
    {
      name: "projectName",
      message: "프로젝트 이름을 입력하세요 (kebab-case, 영문만):",
      default: "my-risu-plugin",
      validate: validateProjectName
    }
  ]);
  return projectName;
}

/**
 * Prompt for project description
 * @param {string} projectName - Project name for default description
 * @returns {Promise<string>} Project description
 */
export async function promptDescription(projectName) {
  const { description } = await inquirer.prompt([
    {
      name: "description",
      message: "프로젝트 설명을 입력하세요:",
      default: `${toPascalCase(projectName)} for RISU AI`
    }
  ]);
  return description;
}

/**
 * Prompt for NPM package name check
 * @returns {Promise<boolean>} True if user wants to check NPM
 */
export async function promptCheckNpm() {
  const { checkNpm } = await inquirer.prompt([
    {
      type: "list",
      name: "checkNpm",
      message: "NPM에 동일한 이름의 패키지가 있는지 확인하시겠습니까?",
      choices: [
        { name: "Y", value: true },
        { name: "N", value: false }
      ],
      default: 0
    }
  ]);
  return checkNpm;
}

/**
 * Prompt for renaming project after NPM conflict
 * @param {string} packageName - Conflicting package name
 * @returns {Promise<boolean>} True if user wants to rename
 */
export async function promptRename(packageName) {
  const { rename } = await inquirer.prompt([
    {
      type: "list",
      name: "rename",
      message: `⚠️  NPM에 '${packageName}' 패키지가 이미 존재합니다. 프로젝트 이름을 변경하시겠습니까?`,
      choices: [
        { name: "Y", value: true },
        { name: "N", value: false }
      ],
      default: 0
    }
  ]);
  return rename;
}
