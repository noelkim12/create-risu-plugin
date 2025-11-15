import fs from "fs-extra";
import path from "path";

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

    await fs.writeFile(readmePath, readme, "utf-8");
  }

  /**
   * Update src/constants.js with project info
   * @returns {Promise<void>}
   */
  async updateConstants() {
    const constantsPath = path.join(this.config.targetDir, "src", "constants.js");
    let constants = await fs.readFile(constantsPath, "utf-8");

    // Replace fallback values
    constants = constants.replace(/\$\{프로젝트명\}/g, this.config.projectName);

    await fs.writeFile(constantsPath, constants, "utf-8");
  }

  /**
   * Update dev-server.js with WebSocket port
   * @returns {Promise<void>}
   */
  async updateDevServerPort() {
    const devServerPath = path.join(this.config.targetDir, "scripts", "dev-server.js");

    if (!fs.existsSync(devServerPath)) {
      console.warn('⚠️  dev-server.js를 찾을 수 없습니다.');
      return;
    }

    let devServer = await fs.readFile(devServerPath, "utf-8");

    // DEFAULT_PORT 값 변경
    devServer = devServer.replace(
      /const DEFAULT_PORT = \d+;/,
      `const DEFAULT_PORT = ${this.config.websocketPort};`
    );

    await fs.writeFile(devServerPath, devServer, "utf-8");
    console.log(`✅ dev-server.js 포트 업데이트: ${this.config.websocketPort}`);
  }

  /**
   * Update vite.config.js with port and Caddy settings
   * @returns {Promise<void>}
   */
  async updateViteConfig() {
    const viteConfigPath = path.join(this.config.targetDir, "vite.config.js");

    if (!fs.existsSync(viteConfigPath)) {
      console.warn('⚠️  vite.config.js를 찾을 수 없습니다.');
      return;
    }

    let viteConfig = await fs.readFile(viteConfigPath, "utf-8");

    // vitePluginDevMode의 defaultPort 변경
    viteConfig = viteConfig.replace(
      /defaultPort: \d+,/,
      `defaultPort: ${this.config.websocketPort},`
    );

    // Caddy 사용 시 useCaddy와 caddyDomain 옵션 추가
    if (this.config.useCaddy) {
      viteConfig = viteConfig.replace(
        /(vitePluginDevMode\(\{[\s\S]*?outputFilePath: path\.resolve\(__dirname, 'src\/core\/dev-reload\.js'\),)/,
        `$1\n      useCaddy: true,\n      caddyDomain: '${this.config.caddyDomain}',`
      );
      console.log(`✅ vite.config.js Caddy 옵션 추가: ${this.config.caddyDomain}`);
    }

    await fs.writeFile(viteConfigPath, viteConfig, "utf-8");
    console.log(`✅ vite.config.js 포트 업데이트: ${this.config.websocketPort}`);
  }

  /**
   * Update all config files
   * @returns {Promise<void>}
   */
  async updateAll() {
    await this.updateReadme();
    await this.updateConstants();
    await this.updateDevServerPort();
    await this.updateViteConfig();
  }
}
