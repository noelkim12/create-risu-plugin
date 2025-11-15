import path from "path";

/**
 * Project configuration builder
 * Holds all configuration options for project generation
 */
export class ProjectConfig {
  constructor() {
    this.projectName = "";
    this.description = "";
    this.targetDir = "";

    // Framework and language options
    this.framework = "vanilla"; // vanilla | react | svelte
    this.language = "javascript"; // javascript | typescript
    this.bundler = "vite"; // webpack | vite (자동 선택)

    // WebSocket and Caddy options
    this.websocketPort = 13131;
    this.useCaddy = false;
    this.caddyDomain = "";
    this.caddyEmail = "";
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
   * @param {string} framework - Framework name (vanilla | react | svelte)
   * @returns {ProjectConfig} this for chaining
   */
  setFramework(framework) {
    this.framework = framework;

    // 프레임워크에 따라 번들러 자동 선택
    if (framework === 'vanilla') {
      this.bundler = 'vite'; // Vanilla도 Vite 사용 (마이그레이션 완료)
    } else {
      this.bundler = 'vite'; // React/Svelte는 Vite 사용
    }

    return this;
  }

  /**
   * Set language
   * @param {string} language - Language (javascript | typescript)
   * @returns {ProjectConfig} this for chaining
   */
  setLanguage(language) {
    this.language = language;
    return this;
  }

  /**
   * Set WebSocket port
   * @param {number} port - WebSocket port number
   * @returns {ProjectConfig} this for chaining
   */
  setWebSocketPort(port) {
    this.websocketPort = port;
    return this;
  }

  /**
   * Set Caddy configuration
   * @param {boolean} useCaddy - Whether to use Caddy
   * @param {string} caddyDomain - Caddy domain (if useCaddy is true)
   * @param {string} caddyEmail - Caddy email (optional)
   * @returns {ProjectConfig} this for chaining
   */
  setCaddy(useCaddy, caddyDomain = "", caddyEmail = "") {
    this.useCaddy = useCaddy;
    this.caddyDomain = caddyDomain;
    this.caddyEmail = caddyEmail;
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
    if (!this.language) {
      throw new Error("언어가 선택되지 않았습니다.");
    }
    if (this.useCaddy && !this.caddyDomain) {
      throw new Error("Caddy를 사용하려면 도메인을 입력해야 합니다.");
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
      language: this.language,
      bundler: this.bundler,
      websocketPort: this.websocketPort,
      useCaddy: this.useCaddy,
      caddyDomain: this.caddyDomain,
      caddyEmail: this.caddyEmail
    };
  }
}
