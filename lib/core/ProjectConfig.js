import path from "path";

import { normalizeFeatureIds } from "../features/featureCatalog.js";

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
    this.features = [];
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
   * Set target directory explicitly (overrides the cwd-based default).
   * Call after setProjectName, which resets targetDir.
   * @param {string} dir - Absolute or cwd-relative output directory
   * @returns {ProjectConfig} this for chaining
   */
  setTargetDir(dir) {
    this.targetDir = path.resolve(dir);
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

  setFeatures(featureIds) {
    this.features = normalizeFeatureIds(featureIds);
    return this;
  }

  hasFeature(featureId) {
    return this.features.includes(featureId);
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
    this.features = normalizeFeatureIds(this.features);
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
      bundler: this.bundler,
      features: [...this.features]
    };
  }
}
