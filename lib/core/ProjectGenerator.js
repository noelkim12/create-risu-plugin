import { TemplateComposer } from "../processors/TemplateComposer.js";
import { FeatureComposer } from "../processors/FeatureComposer.js";
import { FileProcessor } from "../processors/FileProcessor.js";
import { DependencyManager } from "../processors/DependencyManager.js";
import { PackageJsonUpdater } from "../updaters/PackageJsonUpdater.js";
import { ConfigFileUpdater } from "../updaters/ConfigFileUpdater.js";
import { showInfo } from "../utils/messages.js";

/**
 * Project generator - orchestrates the entire project creation process
 */
export class ProjectGenerator {
  constructor(config, options = {}) {
    this.config = config;
    this.skipInstall = options.skipInstall === true;
    this.templateComposer = new TemplateComposer(config);
    this.featureComposer = new FeatureComposer(config);
    this.fileProcessor = new FileProcessor(config);
    this.dependencyManager = new DependencyManager(config);
    this.packageJsonUpdater = new PackageJsonUpdater(config);
    this.configFileUpdater = new ConfigFileUpdater(config);
  }

  /**
   * Validate before generation
   * @returns {boolean} True if validation passes
   * @throws {Error} When the target directory exists or the template is missing
   */
  validate() {
    // Validate config
    this.config.validate();

    // Check if target directory already exists
    if (this.templateComposer.checkTargetExists()) {
      throw new Error(`대상 디렉토리가 이미 존재합니다: ${this.config.targetDir}`);
    }

    // Validate template exists
    if (!this.templateComposer.validateTemplate()) {
      throw new Error(`템플릿을 찾을 수 없습니다: ${this.config.framework}`);
    }

    this.featureComposer.validateFeatures();

    return true;
  }

  /**
   * Generate project
   * @returns {Promise<void>}
   */
  async generate(options = {}) {
    const installDependencies = options.installDependencies ?? !this.skipInstall;
    // Validate first
    this.validate();

    // Step 1: Copy template
    showInfo("템플릿 복사 중...");
    await this.templateComposer.copyTemplate();
    await this.featureComposer.composeFeatures();

    // Step 2: Process files (gitignore rename, etc.)
    await this.fileProcessor.processAllFiles();

    // Step 3: Update configuration files
    showInfo("프로젝트 설정 중...");
    await this.packageJsonUpdater.update();
    await this.configFileUpdater.updateAll();

    // Step 4: Install dependencies
    if (installDependencies) {
      await this.dependencyManager.install();
    }
  }
}
