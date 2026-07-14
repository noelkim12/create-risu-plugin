import fs from "fs-extra";
import { fileURLToPath } from "node:url";
import path from "path";

const LLM_README_MARKER = "<!-- llm-client-readme -->";
const MODULE_FILENAME = fileURLToPath(import.meta.url);
const LLM_README_PATH = path.resolve(
  path.dirname(MODULE_FILENAME),
  "../../templates/features/llm-client/README.fragment.md",
);

/**
 * Config file updater - handles README, constants, and other config files
 */
export class ConfigFileUpdater {
  constructor(config) {
    this.config = config;
  }

  /**
   * Update README.md with project info
   * @returns {Promise<void>}
   */
  async updateReadme() {
    const readmePath = path.join(this.config.targetDir, "README.md");
    let readme = await fs.readFile(readmePath, "utf-8");

    // Replace placeholders
    readme = readme.replace(/\$\{프로젝트명\}/g, this.config.projectName);
    readme = readme.replace(/\$\{파일명\}/g, this.config.projectName);

    if (this.config.hasFeature("llm-client") && !readme.includes(LLM_README_MARKER)) {
      const fragment = await fs.readFile(LLM_README_PATH, "utf-8");
      readme = `${readme.trimEnd()}\n\n${fragment.trim()}\n`;
    }

    await fs.writeFile(readmePath, readme, "utf-8");
  }

  /**
   * Update src/constants/plugin.ts with project info
   * @returns {Promise<void>}
   */
  async updateConstants() {
    const constantsPath = path.join(this.config.targetDir, "src", "constants", "plugin.ts");
    let constants = await fs.readFile(constantsPath, "utf-8");

    // Replace fallback values
    constants = constants.replace(/\$\{프로젝트명\}/g, this.config.projectName);

    await fs.writeFile(constantsPath, constants, "utf-8");
  }

  /**
   * Update all config files
   * @returns {Promise<void>}
   */
  async updateAll() {
    await this.updateReadme();
    await this.updateConstants();
  }
}
