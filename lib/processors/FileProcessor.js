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
   * caddy.config.template을 처리하여 caddy.config 생성
   * @returns {Promise<void>}
   */
  async processCaddyTemplate() {
    if (!this.config.useCaddy) {
      return; // Caddy 사용 안 함
    }

    const templatePath = path.join(this.config.targetDir, "caddy.config.template");

    if (!await fs.pathExists(templatePath)) {
      console.warn('⚠️  caddy.config.template을 찾을 수 없습니다.');
      return;
    }

    const { caddyDomain, caddyEmail, websocketPort } = this.config;

    // 템플릿 읽기
    let content = await fs.readFile(templatePath, "utf-8");

    // 플레이스홀더 치환
    content = content.replace(/\{\{yourdomain\}\}/g, caddyDomain);
    content = content.replace(/\{\{yourport\}\}/g, websocketPort.toString());
    content = content.replace(/\{\{youremail\}\}/g, caddyEmail || 'your-email@example.com');

    // 최종 파일 생성
    const targetPath = path.join(this.config.targetDir, "caddy.config");
    await fs.writeFile(targetPath, content, "utf-8");

    // 템플릿 파일 삭제
    await fs.remove(templatePath);

    console.log(`✅ Caddy 설정 파일 생성: ${caddyDomain}`);
  }

  /**
   * 모든 템플릿 파일을 처리합니다
   * @returns {Promise<void>}
   */
  async processAllFiles() {
    await this.processGitignore();
    await this.processCaddyTemplate();
    // 향후: 여기에 더 많은 파일 처리 기능 추가
    // - 템플릿 변수 치환
    // - 파일 병합
    // - 조건부 파일 포함
  }
}
