import path from "path";

const DEFAULT_BUNDLER = "vite";
const SUPPORTED_FRAMEWORKS = new Set(["vanilla", "svelte"]);

/**
 * Project configuration builder
 * Holds all configuration options for project generation
 */
export class ProjectConfig {
  constructor() {
    this.projectName = "";
    this.description = "";
    this.targetDir = "";

    this.framework = "vanilla";
    this.bundler = DEFAULT_BUNDLER;
  }

  /**
   * Set project name
   * @param {string} name - Project name
   * @returns {ProjectConfig} this for chaining
   */
  setProjectName(name) {
    this.projectName = name;
    this.targetDir = path.resolve(process.cwd(), name);
    return this;
  }

  /**
   * Set project description
   * @param {string} description - Project description
   * @returns {ProjectConfig} this for chaining
   */
  setDescription(description) {
    this.description = description;
    return this;
  }

  /**
   * Set framework
   * @param {string} framework - Framework name (vanilla | svelte)
   * @returns {ProjectConfig} this for chaining
   */
  setFramework(framework) {
    if (!SUPPORTED_FRAMEWORKS.has(framework)) {
      throw new Error("지원하는 프레임워크는 vanilla 또는 svelte입니다.");
    }

    this.framework = framework;
    this.bundler = DEFAULT_BUNDLER;

    return this;
  }

  /**
   * Validate configuration
   * @returns {boolean} True if valid
   * @throws {Error} If configuration is invalid
   */
  validate() {
    if (!this.projectName) {
      throw new Error("프로젝트 이름이 설정되지 않았습니다.");
    }
    if (!this.description) {
      throw new Error("프로젝트 설명이 설정되지 않았습니다.");
    }
    if (!this.framework) {
      throw new Error("프레임워크가 선택되지 않았습니다.");
    }
    if (!SUPPORTED_FRAMEWORKS.has(this.framework)) {
      throw new Error("지원하는 프레임워크는 vanilla 또는 svelte입니다.");
    }
    return true;
  }

  /**
   * Get configuration as plain object
   * @returns {Object} Configuration object
   */
  toObject() {
    return {
      projectName: this.projectName,
      description: this.description,
      targetDir: this.targetDir,
      framework: this.framework,
      bundler: this.bundler
    };
  }
}
