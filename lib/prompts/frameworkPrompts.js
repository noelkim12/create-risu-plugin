import inquirer from "inquirer";

/**
 * Prompt for framework selection
 * @returns {Promise<string>} Selected framework (vanilla | svelte)
 */
export async function promptFramework() {
  const { framework } = await inquirer.prompt([
    {
      name: "framework",
      type: "list",
      message: "어떤 프레임워크를 사용하시겠어요?",
      choices: [
        { name: "Vanilla", value: "vanilla" },
        { name: "Svelte", value: "svelte" }
      ],
      default: "vanilla"
    }
  ]);

  return framework;
}

// Future: Features selection prompts
// export async function promptFeatures() { ... }
