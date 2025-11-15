import inquirer from "inquirer";

/**
 * Prompt for framework selection
 * @returns {Promise<string>} Selected framework (vanilla | react | svelte)
 */
export async function promptFramework() {
  const { framework } = await inquirer.prompt([
    {
      name: "framework",
      type: "list",
      message: "어떤 프레임워크를 사용하시겠어요?",
      choices: [
        { name: "Vanilla JavaScript/TypeScript (순수 JS/TS)", value: "vanilla" },
        { name: "React", value: "react" },
        { name: "Svelte (향후 지원 예정)", value: "svelte", disabled: true }
      ],
      default: "vanilla"
    }
  ]);

  return framework;
}

/**
 * Prompt for language selection
 * @returns {Promise<string>} Selected language (javascript | typescript)
 */
export async function promptLanguage() {
  const { language } = await inquirer.prompt([
    {
      name: "language",
      type: "list",
      message: "어떤 언어를 사용하시겠어요?",
      choices: [
        { name: "JavaScript", value: "javascript" },
        { name: "TypeScript (향후 지원 예정)", value: "typescript", disabled: true }
      ],
      default: "javascript"
    }
  ]);

  return language;
}

// Future: Features selection prompts
// export async function promptFeatures() { ... }
