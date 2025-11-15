import { ProjectConfig } from "./core/ProjectConfig.js";
import { ProjectGenerator } from "./core/ProjectGenerator.js";
import { promptProjectName, promptDescription } from "./prompts/basePrompts.js";
import { promptFramework, promptLanguage } from "./prompts/frameworkPrompts.js";
import {
  promptWebSocketPort,
  promptCaddy,
  promptCaddyDomain,
  promptCaddyEmail
} from "./prompts/devServerPrompts.js";
import { showWelcome, showSuccess, showNextSteps, showError } from "./utils/messages.js";

/**
 * Main entry point for project creation
 * Orchestrates user prompts and project generation
 */
export async function createProject() {
  try {
    // Step 1: Show welcome message
    showWelcome();

    // Step 2: Collect basic project info
    const projectName = await promptProjectName();
    const description = await promptDescription(projectName);

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
