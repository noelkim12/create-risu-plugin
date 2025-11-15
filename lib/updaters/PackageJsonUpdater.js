import fs from "fs-extra";
import path from "path";
import { DependencyManager } from "../processors/DependencyManager.js";

/**
 * Package.json updater
 */
export class PackageJsonUpdater {
  constructor(config) {
    this.config = config;
    this.packageJsonPath = path.join(config.targetDir, "package.json");
    this.dependencyManager = new DependencyManager(config);
  }

  /**
   * Update package.json with project info and dependencies
   * @returns {Promise<void>}
   */
  async update() {
    const packageJson = await fs.readJson(this.packageJsonPath);

    // 1. 기본 정보 업데이트
    packageJson.name = this.config.projectName;
    packageJson.description = this.config.description;
    packageJson.browser = `dist/${this.config.projectName}.js`;
    packageJson.unpkg = `dist/${this.config.projectName}.js`;

    // 2. 의존성 병합
    await this.mergeDependencies(packageJson);

    // 3. Caddy 사용 시 dev 스크립트 수정
    if (this.config.useCaddy) {
      this.updateDevScriptForCaddy(packageJson);
    }

    await fs.writeJson(this.packageJsonPath, packageJson, { spaces: 2 });
  }

  /**
   * Merge dependencies from dependency files
   * @param {Object} packageJson - Package.json object
   * @returns {Promise<void>}
   */
  async mergeDependencies(packageJson) {
    const composedDeps = await this.dependencyManager.composeDependencies();

    // dependencies 병합
    if (composedDeps.dependencies && Object.keys(composedDeps.dependencies).length > 0) {
      packageJson.dependencies = {
        ...packageJson.dependencies,
        ...composedDeps.dependencies
      };
    }

    // devDependencies 병합
    if (composedDeps.devDependencies && Object.keys(composedDeps.devDependencies).length > 0) {
      packageJson.devDependencies = {
        ...packageJson.devDependencies,
        ...composedDeps.devDependencies
      };
    }
  }

  /**
   * Update dev script to include Caddy
   * @param {Object} packageJson - Package.json object
   */
  updateDevScriptForCaddy(packageJson) {
    if (!packageJson.scripts || !packageJson.scripts.dev) {
      console.warn('⚠️  dev 스크립트를 찾을 수 없습니다.');
      return;
    }

    // 기존: "concurrently \"npm run dev:server\" \"npm run dev:vite\""
    // 변경: "concurrently \"npm run dev:server\" \"npm run dev:vite\" \"caddy run --config caddy.config\""

    const currentDevScript = packageJson.scripts.dev;

    // concurrently 명령어인지 확인
    if (currentDevScript.includes('concurrently')) {
      // 마지막 " 제거하고 caddy 명령어 추가
      const updatedScript = currentDevScript.slice(0, -1) + '" "caddy run --config caddy.config --adapter caddyfile"';
      packageJson.scripts.dev = updatedScript;
      console.log('✅ dev 스크립트에 Caddy 추가 완료');
    } else {
      console.warn('⚠️  concurrently를 사용하지 않는 dev 스크립트입니다. 수동으로 Caddy를 추가해주세요.');
    }
  }
}
