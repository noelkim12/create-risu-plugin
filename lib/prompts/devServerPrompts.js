import inquirer from "inquirer";
import chalk from "chalk";

/**
 * Prompt for WebSocket port
 * @returns {Promise<number>} WebSocket port number
 */
export async function promptWebSocketPort() {
  const { port } = await inquirer.prompt([
    {
      name: "port",
      message: "WebSocket 포트 번호를 입력하세요:",
      default: "13131",
      validate: (input) => {
        const num = parseInt(input, 10);
        if (isNaN(num)) {
          return "숫자만 입력 가능합니다.";
        }
        if (num < 1024 || num > 65535) {
          return "포트 번호는 1024-65535 범위여야 합니다.";
        }
        return true;
      }
    }
  ]);

  return parseInt(port, 10);
}

/**
 * Show Caddy information
 */
function showCaddyInfo() {
  console.log(chalk.cyan("\n📘 Caddy란?"));
  console.log(chalk.white("Caddy는 자동 HTTPS를 TLS종단기 입니다."));
  console.log(chalk.white("개발 중인 플러그인을 HTTPS 도메인에서 테스트할 때 유용합니다.\n"));

  console.log(chalk.yellow("🔗 사용 시나리오:"));
  console.log(chalk.white("- 로컬 개발 서버를 도메인으로 접근 (예: wss://dev.example.com/ws)"));
  console.log(chalk.white("- HTTPS 환경에서 WebSocket 연결 테스트"));
  console.log(chalk.white("- 팀원과 로컬 개발 환경 공유\n"));

  console.log(chalk.gray("📖 자세한 내용: https://github.com/noelkim12/create-risu-plugin/blob/main/docs/CADDY_GUIDE.md\n"));
}

/**
 * Prompt for Caddy usage
 * @returns {Promise<boolean>} Whether to use Caddy
 */
export async function promptCaddy() {
  // Caddy 정보 표시
  showCaddyInfo();

  const { useCaddy } = await inquirer.prompt([
    {
      name: "useCaddy",
      type: "list",
      message: "Caddy를 사용하시겠습니까?",
      choices: [
        { name: "N", value: false },
        { name: "Y", value: true }
      ],
      default: 0 // 첫 번째 선택지(아니오)가 기본값
    }
  ]);

  return useCaddy;
}

/**
 * Prompt for Caddy domain
 * @returns {Promise<string>} Caddy domain
 */
export async function promptCaddyDomain() {
  const { domain } = await inquirer.prompt([
    {
      name: "domain",
      message: "Caddy 도메인 주소를 입력하세요 (예: dev.example.com):",
      validate: (input) => {
        if (!input || input.trim() === "") {
          return "도메인 주소는 필수입니다.";
        }
        // 기본적인 도메인 형식 검증
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        if (!domainRegex.test(input)) {
          return "올바른 도메인 형식이 아닙니다.";
        }
        return true;
      }
    }
  ]);

  return domain;
}

/**
 * Prompt for Caddy email (optional)
 * @returns {Promise<string>} Caddy email
 */
export async function promptCaddyEmail() {
  const { email } = await inquirer.prompt([
    {
      name: "email",
      message: "Caddy 인증서 알림용 이메일을 입력하세요 (선택사항, Enter로 건너뛰기):",
      default: "",
      validate: (input) => {
        if (!input || input.trim() === "") {
          return true; // 선택사항이므로 빈 값 허용
        }
        // 기본적인 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(input)) {
          return "올바른 이메일 형식이 아닙니다.";
        }
        return true;
      }
    }
  ]);

  return email;
}
