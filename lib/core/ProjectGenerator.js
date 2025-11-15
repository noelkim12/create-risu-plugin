import { TemplateComposer } from "../processors/TemplateComposer.js";
import { FileProcessor } from "../processors/FileProcessor.js";
import { DependencyManager } from "../processors/DependencyManager.js";
import { PackageJsonUpdater } from "../updaters/PackageJsonUpdater.js";
import { ConfigFileUpdater } from "../updaters/ConfigFileUpdater.js";
import { showInfo } from "../utils/messages.js";

/**
 * Project generator - orchestrates the entire project creation process
 */
export class ProjectGenerator {
  constructor(config) {
    this.config = config;
    this.templateComposer = new TemplateComposer(config);
    this.fileProcessor = new FileProcessor(config);
    this.dependencyManager = new DependencyManager(config);
    this.packageJsonUpdater = new PackageJsonUpdater(config);
    this.configFileUpdater = new ConfigFileUpdater(config);
  }

  /**
   * Validate before generation
   * @returns {boolean} True if validation passes
   */
  validate() {
    // Validate config
    this.config.validate();

    // Check if target directory already exists
    if (this.templateComposer.checkTargetExists()) {
      process.exit(1);
    }

    // Validate template exists
    if (!this.templateComposer.validateTemplate()) {
      process.exit(1);
    }

    return true;
  }

  /**
   * Generate project
   * @returns {Promise<void>}
   */
  async generate() {
    // Validate first
    this.validate();

    // Step 1: Copy template
    showInfo("템플릿 복사 중...");
    await this.templateComposer.copyTemplate();

    // Step 2: Process files (gitignore rename, etc.)
    await this.fileProcessor.processAllFiles();

    // Step 3: Update configuration files
    showInfo("프로젝트 설정 중...");
    await this.packageJsonUpdater.update();
    await this.configFileUpdater.updateAll();

    // Step 4: Install dependencies
    await this.dependencyManager.install();
  }
}
