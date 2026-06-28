import fs from "fs-extra";
import path from "path";

/**
 * 파일 프로세서 - 파일 변환 작업을 처리합니다
 */
export class FileProcessor {
  constructor(config) {
    this.config = config;
  }

  /**
   * gitignore.template을 .gitignore로 이름 변경
   * npm은 패키지에 .gitignore 파일을 포함하지 않으므로 템플릿을 사용합니다
   * @returns {Promise<void>}
   */
  async processGitignore() {
    const templatePath = path.join(this.config.targetDir, "gitignore.template");
    const targetPath = path.join(this.config.targetDir, ".gitignore");

    if (await fs.pathExists(templatePath)) {
      await fs.move(templatePath, targetPath);
    }
  }

  /**
   * 모든 템플릿 파일을 처리합니다
   * @returns {Promise<void>}
   */
  async processAllFiles() {
    await this.processGitignore();
  }
}
