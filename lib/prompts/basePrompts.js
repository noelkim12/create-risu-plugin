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
