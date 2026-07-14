import inquirer from "inquirer";
import { featurePromptChoices } from "../features/featureCatalog.js";

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

export async function promptFeatures() {
  const { features } = await inquirer.prompt([
    {
      name: "features",
      type: "checkbox",
      message: "추가 기능을 선택하세요 (Space로 선택, Enter로 완료):",
      choices: featurePromptChoices(),
      default: []
    }
  ]);

  return features;
}
